// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

interface IChamber {
    event Supply(address indexed asset, uint256 amount);
    event Deposit(address indexed asset, uint256 amount);
    event Withdraw(address indexed asset, uint256 amount);
    event Redeem(address indexed cToken, uint256 amount);
    event ExecuteSwap(address indexed asset, uint256 amount);

    function getOwner() external view returns (address);

    function getFactory() external view returns (address);

    function supplyETH() external payable;

    function redeemETH(uint256 amount) external;

    function buyETH(address asset, uint256 amount) external;

    function deposit(address asset, uint256 amount) external;

    function withdraw(address asset, uint256 amount) external;

    function initialize(
        address owner,
        address compoundManager,
        address _uniswapExchange
    ) external;
}