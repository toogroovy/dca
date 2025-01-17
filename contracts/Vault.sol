// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./interfaces/IWeth.sol";
import "./interfaces/IVault.sol";
import "./interfaces/VaultLibrary.sol";
import "./interfaces/IExecutor.sol";
import "./VaultStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract Vault is IVault, Initializable {
    address private factory;
    address private owner;
    address private operator;
    Status private status;
    mapping(address => uint256) private balances;
    address[] private tokens;
    VaultStorage private vaultStorage;

    IWeth public constant WETH =
        IWeth(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    modifier onlyOwner() {
        require(msg.sender == owner, "Restricted to Owner");
        _;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "Restricted to Factory");
        _;
    }

    modifier isActive() {
        require(status == Status.ACTIVE, "Vault is not active");
        _;
    }

    modifier onlyAuthorized() {
        require(
            (msg.sender == owner || msg.sender == operator),
            "Unauthorized"
        );
        _;
    }

    constructor() {
        _disableInitializers();
    }

    receive() external payable {
        emit Deposit(address(0), msg.value);
    }

    function initialize(
        address _factory,
        address _owner,
        address _operator,
        address _vaultStorage
    ) external initializer {
        factory = _factory;
        owner = _owner;
        operator = _operator;
        vaultStorage = VaultStorage(_vaultStorage);
    }

    function setVaultStatus(uint8 _status) external onlyOwner {
        status = Status(_status);
    }

    function setOperator(address _operator) external onlyOwner {
        operator = _operator;
        emit NewOperator(_operator);
    }

    function deposit(address _asset, uint256 _amount) external override {
        require(
            IERC20(_asset).allowance(msg.sender, address(this)) >= _amount,
            "Insufficient allowance"
        );

        require(
            IERC20(_asset).transferFrom(msg.sender, address(this), _amount),
            "Insufficient balance"
        );

        balances[_asset] += _amount;

        emit Deposit(_asset, _amount);
    }

    function depositETH() external payable {
        emit Deposit(VaultLibrary.ETH, msg.value);
    }

    function withdraw(
        address _asset,
        uint256 _amount
    ) external override onlyOwner {
        require(
            IERC20(_asset).balanceOf(address(this)) >= _amount,
            "Insufficient balance"
        );

        require(IERC20(_asset).transfer(owner, _amount));

        balances[_asset] -= _amount;
        emit Withdraw(_asset, _amount);
    }

    function withdrawETH(
        uint256 _amount
    ) external override onlyOwner returns (bool) {
        require(address(this).balance >= _amount, "Insufficient balance");

        (bool success, bytes memory data) = owner.call{value: _amount}("");
        require(success, VaultLibrary.getRevertMsg(data));

        emit Withdraw(address(0), _amount);

        return true;
    }

    function createStrategy(
        bytes32 _hashId,
        address _buyToken,
        address _sellToken,
        uint256 _amount,
        uint16 _frequency
    ) external override onlyOwner isActive returns (bytes32) {
        require(
            (_buyToken != address(0) && _sellToken != address(0)),
            "Cannot buy or sell to Zero address"
        );
        require(
            balances[_sellToken] >= _amount,
            "Insufficient funds for Strategy"
        );

        bytes32 hashId = vaultStorage.createStrategy(
            _hashId,
            _buyToken,
            _sellToken,
            _amount,
            _frequency
        );

        emit NewStrategy(hashId, _buyToken, _sellToken, _amount, _frequency);
        return _hashId;
    }

    function updateStrategy(Strategy memory _strategy) external onlyOwner {
        vaultStorage.updateStrategy(_strategy);
        emit UpdateStrategy(_strategy.hashId);
    }

    function deprecateStrategy(bytes32 _hash) external override onlyOwner {
        vaultStorage.deprecateStrategy(_hash);
        emit DeprecateStrategy(_hash);
    }

    function reactivateStrategy(bytes32 _hash) external override onlyOwner {
        vaultStorage.reactivateStrategy(_hash);
        emit ReactivateStrategy(_hash);
    }

    function deleteStrategy(bytes32 _hash) external override onlyOwner {
        vaultStorage.deleteStrategy(_hash);
        emit DeleteStrategy(_hash);
    }

    function executeStrategy(
        bytes32 _hashId,
        address _spender,
        address payable _swapTarget,
        bytes calldata _swapCallData
    ) external onlyAuthorized isActive {
        Strategy memory strategy = vaultStorage.getStrategy(_hashId);

        bool success = _executeSwap(
            strategy.sellToken,
            strategy.buyToken,
            strategy.amount,
            _spender,
            _swapTarget,
            _swapCallData
        );

        require(success, "Failed to execute strategy");

        strategy.lastSwap = block.timestamp;
        strategy.swapCount += 1;
        vaultStorage.updateStrategy(strategy);

        emit ExecuteStrategy(_hashId);
    }

    function executeSwap(
        address _sellToken,
        address _buyToken,
        uint256 _amount,
        address _spender,
        address payable _swapTarget,
        bytes calldata _swapCallData
    ) external payable override onlyAuthorized {
        bool success = _executeSwap(
            _sellToken,
            _buyToken,
            _amount,
            _spender,
            _swapTarget,
            _swapCallData
        );

        require(success, "Failed to execute swap");
    }

    function _executeSwap(
        address _sellToken,
        address _buyToken,
        uint256 _amount,
        address _spender,
        address payable _swapTarget,
        bytes calldata _swapCallData
    ) internal returns (bool) {
        require(
            balances[_sellToken] >= _amount,
            "Insufficient balance for swap"
        );
        // Give `spender` an infinite allowance to spend this contract's `sellToken`
        if (IERC20(_sellToken).allowance(address(this), _spender) < _amount) {
            require(IERC20(_sellToken).approve(_spender, type(uint256).max));
        }

        // Execute swap using 0x Liquidity
        (bool success, bytes memory data) = _swapTarget.call{value: msg.value}(
            _swapCallData
        );

        require(success, VaultLibrary.getRevertMsg(data));

        emit ExecuteSwap(_sellToken, _buyToken, _amount, data);

        balances[_buyToken] = IERC20(_buyToken).balanceOf(address(this));
        balances[_sellToken] = IERC20(_sellToken).balanceOf(address(this));

        return success;
    }

    function wrapETH(uint256 _amount) external onlyAuthorized {
        require(address(this).balance >= _amount);
        WETH.deposit{value: _amount}();
        balances[address(WETH)] = WETH.balanceOf(address(this));
    }

    function unwrapETH(uint256 _amount) external onlyAuthorized {
        require(balances[address(WETH)] >= _amount);
        WETH.withdraw(_amount);
        balances[address(WETH)] = WETH.balanceOf(address(this));
    }

    function getOwner() external view returns (address) {
        return owner;
    }

    function getOperator() external view returns (address) {
        return operator;
    }

    function getFactory() external view returns (address) {
        return factory;
    }

    function getStatus() external view returns (Status) {
        return status;
    }

    function getStrategy(
        bytes32 _hash
    ) external view returns (Strategy memory) {
        Strategy memory strategy = vaultStorage.getStrategy(_hash);

        require(strategy.buyToken != address(0), "Strategy not found");
        return strategy;
    }

    function getStrategies() external view returns (Strategy[] memory) {
        Strategy[] memory strats = vaultStorage.getStrategies();
        return strats;
    }

    function getActiveStrategies() external view returns (Strategy[] memory) {
        Strategy[] memory active = vaultStorage.getActiveStrategies();
        return active;
    }

    function balanceOf(
        address _asset
    ) external view override returns (uint256) {
        return balances[_asset];
    }
}
