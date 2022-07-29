const { expect } = require("chai");
const { ethers, network, waffle } = require("hardhat");
const {
  USDT_WHALE,
  WHALE,
  chamberFactoryFixture,
  tokenFixture,
} = require("./utils");

describe("Chamber", () => {
  let accounts, whale, usdtWhale;
  let chamber, chamberFactory;
  let weth, dai, usdc;
  let cEth, cUsdc, cDai;

  const daiAmount = 100n * 10n ** 18n;
  const usdcAmount = 100n * 10n ** 6n;
  const usdtAmount = 100n * 10n ** 6n;
  const ethAmount = 5n * 10n ** 18n;

  beforeEach(async () => {
    [user, ...accounts] = await ethers.getSigners();
    const contracts = await chamberFactoryFixture();
    const tokens = await tokenFixture();

    chamber = contracts.chamber;
    chamberFactory = contracts.chamberFactory;

    dai = tokens.dai;
    weth = tokens.weth;
    usdc = tokens.usdc;
    usdt = tokens.usdt;
    cEth = tokens.cEth;
    cDai = tokens.cDai;
    cUsdc = tokens.cUsdc;

    let tx = await chamberFactory.connect(user).deployChamber();
    let receipt = await tx.wait();

    // get the chamber we just deployed using the address from logs
    chamber = await ethers.getContractAt(
      "IChamber",
      receipt.events[0].args.instance
    );

    // unlock USDC/DAI Whale account
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [WHALE],
    });

    // unlock USDT Whale account
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [USDT_WHALE],
    });

    whale = await ethers.getSigner(WHALE);
    usdtWhale = await ethers.getSigner(USDT_WHALE);

    // transfer 100 USDC & 100 DAI from whale to dev
    await dai.connect(whale).transfer(user.address, daiAmount);
    await usdc.connect(whale).transfer(user.address, usdcAmount);
    await usdt.connect(usdtWhale).transfer(user.address, usdtAmount);

    // give approval to the chamber
    await dai.connect(user).approve(chamber.address, daiAmount);
    await usdc.connect(user).approve(chamber.address, usdcAmount);
    await usdt.connect(user).approve(chamber.address, usdtAmount);
  });

  // ========================= DEPOSIT =============================

  it("deposit: Should deposit DAI into chamber and update balance", async () => {
    await chamber.connect(user).deposit(dai.address, daiAmount);
    let balance = await chamber.balanceOf(dai.address);

    expect(balance).to.be.equal(daiAmount);
  });

  it("deposit: Should deposit USDC into chamber and update balance", async () => {
    await chamber.connect(user).deposit(usdc.address, usdcAmount);
    let balance = await chamber.balanceOf(usdc.address);

    expect(balance).to.be.equal(usdcAmount);
  });

  // it("deposit: Should deposit USDT into chamber and update balance", async () => {
  //   await chamber.connect(user).deposit(usdt.address, usdtAmount);
  //   let balance = await chamber.balanceOf(usdc.address);

  //   expect(balance).to.be.equal(usdcAmount);
  // });

  it("depositETH: Should deposit ETH into chamber and update balance", async () => {
    await user.sendTransaction({ to: chamber.address, value: ethAmount });
    let balance = await waffle.provider.getBalance(chamber.address);

    expect(balance).to.be.equal(ethAmount);
  });

  // ========================= WITHDRAW =============================

  it("withdraw: Should withdraw DAI from chamber and update balance", async () => {
    await chamber.connect(user).deposit(dai.address, daiAmount);
    await chamber.connect(user).withdraw(dai.address, daiAmount);

    let balance = await chamber.balanceOf(dai.address);

    expect(balance).to.be.equal(0);
  });

  it("withdraw: Should withdraw USDC from chamber", async () => {
    await chamber.connect(user).deposit(usdc.address, usdcAmount);
    await chamber.connect(user).withdraw(usdc.address, usdcAmount);

    let balance = await chamber.balanceOf(usdc.address);

    expect(balance).to.be.equal(0);
  });

  it("withdrawETH: Should withdraw ETH from chamber", async () => {
    await user.sendTransaction({ to: chamber.address, value: ethAmount });

    let userBalanceBefore = await waffle.provider.getBalance(user.address);
    let chamberBalanceBefore = await waffle.provider.getBalance(
      chamber.address
    );

    await chamber.connect(user).withdrawETH(ethAmount);

    let userBalanceAfter = await waffle.provider.getBalance(user.address);
    let chamberBalanceAfter = await waffle.provider.getBalance(chamber.address);

    expect(chamberBalanceBefore).to.be.equal(ethAmount);
    expect(chamberBalanceAfter).to.be.equal(0);
    expect(userBalanceAfter).to.be.gt(userBalanceBefore);
  });

  // ========================= BUY ETH =============================

  it("buyETH: Should buy ETH using DAI", async () => {
    await chamber.connect(user).deposit(dai.address, daiAmount);
    await chamber.connect(user).buyETH(dai.address, daiAmount);

    let chamberBalance = await waffle.provider.getBalance(chamber.address);

    expect(chamberBalance).to.be.gt(0);
  });

  it("buyETH: Should buy ETH using USDC", async () => {
    await chamber.connect(user).deposit(usdc.address, usdcAmount);
    await chamber.connect(user).buyETH(usdc.address, usdcAmount);

    let chamberBalance = await waffle.provider.getBalance(chamber.address);

    expect(chamberBalance).to.be.gt(0);
  });

  // ========================= SUPPLY ETH =============================

  it("supplyETH: Should supply ETH on compound", async () => {
    await user.sendTransaction({ to: chamber.address, value: ethAmount });
    await chamber.connect(user).supplyETH(ethAmount);

    let cEthBalance = await cEth.balanceOf(chamber.address);

    expect(cEthBalance).to.be.gt(0);
  });

  // ========================= REDEEM ETH =============================

  it("redeemETH: Should redeem ETH from compound", async () => {
    await user.sendTransaction({ to: chamber.address, value: ethAmount });
    await chamber.connect(user).supplyETH(ethAmount);

    let cEthBalance = await cEth.balanceOf(chamber.address);
    let balanceBefore = await waffle.provider.getBalance(chamber.address);

    await chamber.connect(user).redeemETH(cEthBalance);

    let balanceAfter = await waffle.provider.getBalance(chamber.address);

    expect(balanceAfter).to.be.gt(balanceBefore);
  });

  // ========================= BALANCE OF =============================

  it("balanceOf: Should return a balance of 50 DAI and 50 USDC", async () => {
    await chamber.connect(user).deposit(dai.address, daiAmount);
    await chamber.connect(user).deposit(usdc.address, usdcAmount);

    const daiWithdrawal = 50n * 10n ** 18n;
    const usdcWithdrawal = 50n * 10n ** 6n;

    await chamber.connect(user).withdraw(dai.address, daiWithdrawal);
    await chamber.connect(user).withdraw(usdc.address, usdcWithdrawal);

    let daiBalance = await chamber.balanceOf(dai.address);
    let usdcBalance = await chamber.balanceOf(usdc.address);

    expect(daiBalance).to.be.equal(daiWithdrawal);
    expect(usdcBalance).to.be.equal(usdcWithdrawal);
  });

  // ========================= GET OWNER =============================
  it("getOwner: Should return the chamber owner address", async () => {
    const owner = await chamber.getOwner();
    expect(owner).to.be.equal(user.address);
  });

  // ========================= GET FACTORY =============================

  it("getFactory: Should return the ChamberFactory address", async () => {
    const factory = await chamber.getFactory();
    expect(factory).to.be.equal(chamberFactory.address);
  });
});
