const { ethers, web3 } = require("hardhat");

const WHALE = "0xfa4fc4ec2f81a4897743c5b4f45907c02ce06199";
const USDT_WHALE = "0xa929022c9107643515f5c777ce9a910f0d1e490c";

const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const TOKEN_DETAILS = {
  networks: {
    mainnet: {
      DAI,
      USDC,
      WETH,
    },
  },
};

function createQueryString(url, params) {
  return (
    url +
    Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join("&")
  );
}

const chamberLibraryFixture = async () => {
  const Library = await ethers.getContractFactory("ChamberLibrary");
  const library = await Library.deploy();
  await library.deployed();

  return library;
};

const tokenFixture = async () => {
  const dai = await ethers.getContractAt("IERC20", DAI);
  const weth = await ethers.getContractAt("IWETH", WETH);
  const usdc = await ethers.getContractAt("IERC20", USDC);
  const usdt = await ethers.getContractAt("IERC20", USDT);

  return { dai, weth, usdc, usdt };
};

const chamberFactoryFixture = async () => {
  const library = await chamberLibraryFixture();
  const [deployer, user, treasury] = await ethers.getSigners();

  const ChamberFactory = await ethers.getContractFactory("ChamberFactory", {
    libraries: {
      ChamberLibrary: library.address,
    },
  });

  const chamberFactory = await ChamberFactory.connect(deployer).deploy(
    treasury.address
  );
  await chamberFactory.deployed();

  return chamberFactory;
};

const getHash = (...args) => {
  return web3.utils.soliditySha3(...args);
};

const inspectForEvent = (target, events) => {
  let present = false;

  events.map((item) => {
    if (item.event === target) {
      present = true;
    }
  });
  return present;
};

const getEventObject = (target, events) => {
  let event = null;
  events.map((item) => {
    if (item.event === target) {
      event = item;
    }
  });
  return event;
};

module.exports = {
  WHALE,
  USDT_WHALE,
  TOKEN_DETAILS,
  getHash,
  getEventObject,
  tokenFixture,
  inspectForEvent,
  createQueryString,
  chamberFactoryFixture,
};
