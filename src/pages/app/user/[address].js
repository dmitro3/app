import React, { useState, useEffect } from 'react';
import Navbar from '@/components/navbar';
import BottomBar from '@/components/bottombar';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { ref, onValue } from 'firebase/database';
import { db } from '../../../../firebase';
import { ethers } from 'ethers';
import ABI from '../../../utils/ABI.json';
import { useAccount, useContractWrite } from 'wagmi';
import LiveGraph from '@/components/livegraph'
import { ProviderURL, ContractAddress } from '../../../constants'

const AddressPage = () => {
    const router = useRouter();
    const { address } = router.query;
    const { address: addressUser } = useAccount();
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [ghostPrice, setGhostPrice] = useState(null);
    const [ghostSellPrice, setGhostSellPrice] = useState(null);
    const [shareHold, setShareHold] = useState(null);
    const [tradeData, setTradeData] = useState([]);
    const [buyPriceAfterFeeString, setBuyPriceAfterFeeString] = useState('');
    const [isTxModalOpen, setTxModalOpen] = useState(false);
    const contractAddress = ContractAddress;
    const contractAbi = ABI;
    const providerUrl = ProviderURL;

    useEffect(() => {
        async function fetchUserData() {
            if (address) {
                const usersRef = ref(db, 'users');
                onValue(usersRef, (snapshot) => {
                    const usersData = snapshot.val();
                    if (usersData) {
                        const user = Object.values(usersData).find(user => user.address === address);
                        if (user) {
                            setUserData(user);
                        }
                        setIsLoading(false);
                    }
                });
            }
        }
        fetchUserData();
    }, [address]);

    useEffect(() => {
        async function fetchGhostPrice() {
            setTimeout(async () => {
                const provider = new ethers.JsonRpcProvider(providerUrl);
                const contract = new ethers.Contract(contractAddress, contractAbi, provider);
                const amount = 1;
                const ghostPriceWei = await contract.getBuyPriceAfterFee(address, amount);
                const ghostPriceString = ghostPriceWei.toString();
                const ghostPriceEtherDivided = parseFloat(ghostPriceString) / 1000000000000000000;
                const ghostPriceFormatted = parseFloat(ghostPriceEtherDivided).toFixed(5);
                setGhostPrice(ghostPriceFormatted);
            }, 500);
        }
        fetchGhostPrice();
    }, [address]);

    useEffect(() => {
        async function fetchGhostSellPrice() {
            setTimeout(async () => {
                const provider = new ethers.JsonRpcProvider(providerUrl);
                const contract = new ethers.Contract(contractAddress, contractAbi, provider);
                const amount = 1;
                const ghostPriceWei = await contract.getSellPriceAfterFee(address, amount);
                const ghostPriceString = ghostPriceWei.toString();
                const ghostPriceEtherDivided = parseFloat(ghostPriceString) / 1000000000000000000;
                const ghostPriceFormatted = parseFloat(ghostPriceEtherDivided).toFixed(5);
                setGhostSellPrice(ghostPriceFormatted);
            }, 500);
        }
        fetchGhostSellPrice();
    }, [address]);

    useEffect(() => {
        async function fetchBuyPriceAfterFee() {
            const provider = new ethers.JsonRpcProvider(providerUrl);
            const contract = new ethers.Contract(contractAddress, contractAbi, provider);
            const amount = 1;
            setTimeout(async () => {
                try {
                    const buyPriceAfterFeeWei = await contract.getBuyPriceAfterFee(address, amount);
                    const buyPriceAfterFeeString = buyPriceAfterFeeWei.toString();
                    setBuyPriceAfterFeeString(buyPriceAfterFeeString);
                } catch (error) {
                    console.error('Error fetching buy price after fee:', error);
                }
            }, 500);
        }
        fetchBuyPriceAfterFee();
    }, [address]);

    useEffect(() => {
        async function fetchSharesBalance() {
            setTimeout(async () => {
                const provider = new ethers.JsonRpcProvider(providerUrl);
                const contract = new ethers.Contract(contractAddress, contractAbi, provider);
                const sharesBalance = await contract.sharesBalance(address, addressUser);
                setShareHold(sharesBalance.toString());
                console.log(sharesBalance.toString());
            }, 500);
        }
        fetchSharesBalance();
    }, [address]);

    useEffect(() => {
        async function fetchTradeEvents() {
            const provider = new ethers.JsonRpcProvider(providerUrl);
            const contract = new ethers.Contract(contractAddress, contractAbi, provider);
            const currentBlockNumber = await provider.getBlockNumber();
            const startBlockNumber = currentBlockNumber - 200000;
            const filter = contract.filters.Trade(null, null);
            const logs = await contract.queryFilter(filter, startBlockNumber, currentBlockNumber);
            const trades = logs.filter(log => log.args.subject && log.args.subject.toLowerCase() === address.toLowerCase()).map(log => {
                const timestampInMillis = Number(log.args.timestamp) * 1000;
                const timestampDate = new Date(timestampInMillis);
                const formattedTime = timestampDate.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                const priceInEther = convertWeiToEther(log.args.ethAmount);
                return {
                    timestamp: formattedTime,
                    price: priceInEther,
                };
            });
            const aggregatedTrades = trades.reduce((accumulator, trade) => {
                const { timestamp, price } = trade;
                if (!accumulator[timestamp]) {
                    accumulator[timestamp] = { time: timestamp, totalPrice: 0, count: 0 };
                }
                accumulator[timestamp].totalPrice += parseFloat(price);
                accumulator[timestamp].count += 1;
                return accumulator;
            }, {});
            const aggregatedTradeArray = Object.values(aggregatedTrades).map(aggregatedTrade => {
                return {
                    time: aggregatedTrade.time,
                    ghostPrice: (aggregatedTrade.totalPrice / aggregatedTrade.count) * 109 / 100
                };
            });
            setTradeData(aggregatedTradeArray);
        }
        fetchTradeEvents();
    }, [address]);

    function convertWeiToEther(weiAmount) {
        if (weiAmount === 0n) {
            return "0";
        } else {
            const etherValue = parseFloat(weiAmount) / 1e18;
            return etherValue.toFixed(5);
        }
    }

    const { write: buyGhost, isLoading: isBuying, isError: isErrorBuying, isSuccess: isSuccessBuying } = useContractWrite({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'buyGhost',
    });

    async function buyTx(address, addressUser) {
        try {
            let priceValue = buyPriceAfterFeeString;
            buyGhost({ args: [address, 1], from: addressUser, value: priceValue });
        } catch (e) {
            console.log(e);
        }
    }

    const { write: sellGhost, isLoading: isSelling, isError: isErrorSelling, isSuccess: isSuccessSelling } = useContractWrite({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'sellGhost',
    });

    async function sellTx(address, addressUser) {
        sellGhost({ args: [address, 1], from: addressUser });
    }

    function refreshPage() {
        window.location.reload();
    }

    function openTxModal() {
        setTxModalOpen(true);
    }

    function closeTxModal() {
        setTxModalOpen(false);
        refreshPage();
    }

    return (
        <div>
            <Navbar />
            {isLoading ? (
                <div className="flex items-center justify-center pt-60">
                    <div className="animate-spin">
                        <Image src="/ghost.png" alt='logo ghostfi.xyz' width={120} height={120} />
                    </div>
                </div>
            ) :
                <div>
                    {userData ? (
                        <div>
                            <div className="justify-center mx-auto items-center flex max-w-xl pt-14">
                                <span className="mx-4 pt-1  py-1.5 font-extralight text-md hover:font-bold"><span className='font-semibold'>{userData.displayUsername}</span>'s Profile 👤</span>
                                <div className="ml-auto">
                                    <button onClick={refreshPage} className="mx-4">
                                        <svg width="20" height="20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
                                            <path fill="none" stroke="#fff" d="M25.7 10.9C23.9 7.4 20.2 5 16 5c-4.7 0-8.6 2.9-10.2 7m.4 9c1.8 3.5 5.5 6 9.8 6 4.7 0 8.6-2.9 10.2-7" />
                                            <path fill="none" stroke="#fff" d="M26 5v6h-6M6 27v-6h6" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div className="justify-center mx-auto items-center flex pt-2">
                                <div className="max-w-xl border border-sec rounded-xl py-2 px-10 flex items-center">
                                    <div className="flex flex-col items-center">
                                        <div className='flex'>
                                            <img
                                                src={userData.pfpUrl}
                                                width={55}
                                                height={55}
                                                className="rounded-full border border-sec"
                                            />
                                            <div className="px-3"></div>
                                            <div className="flex flex-col">
                                                <span className="text-white text-2xl font-semibold text-center">
                                                    {userData.displayUsername}
                                                </span>
                                                <div className="flex items-center justify-center mt-0.5">
                                                    <svg
                                                        width="20"
                                                        height="20"
                                                        viewBox="0 0 24 24"
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        fill="#5eead3"
                                                    >
                                                        <path d="M22 5.8a8.49 8.49 0 0 1-2.36.64 4.13 4.13 0 0 0 1.81-2.27 8.21 8.21 0 0 1-2.61 1 4.1 4.1 0 0 0-7 3.74 11.64 11.64 0 0 1-8.45-4.29 4.16 4.16 0 0 0-.55 2.07 4.09 4.09 0 0 0 1.82 3.41 4.05 4.05 0 0 1-1.86-.51v.05a4.1 4.1 0 0 0 3.3 4 3.93 3.93 0 0 1-1.1.17 4.9 4.9 0 0 1-.77-.07 4.11 4.11 0 0 0 3.83 2.84A8.22 8.22 0 0 1 3 18.34a7.93 7.93 0 0 1-1-.06 11.57 11.57 0 0 0 6.29 1.85A11.59 11.59 0 0 0 20 8.45v-.53a8.43 8.43 0 0 0 2-2.12Z" />
                                                    </svg>
                                                    <a href={`https://twitter.com/${userData.username}`}>
                                                        <span className="ml-1 text-sec font-light underline text-sm">
                                                            @{userData.username}
                                                        </span>
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                        <div className='relative w-full'>
                                            <hr className='absolute border-t border-sec top-2 left-0 w-full' />
                                        </div>
                                        <div className="flex pt-4">
                                            {userData.bio ? (
                                                <div className="flex items-center">
                                                    <span className="text-xs mx-1 font-extralight">{userData.bio}</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center">
                                                    <span className="text-xs mx-1 font-extralight">Hi I am new on <span className='text-sec'>ghostfi</span>.xyz! 👋</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="justify-center gap-2 items-center text-center mx-auto flex pt-3">
                                <div className="flex items-center border rounded-lg px-2 py-0.5">
                                    <span className="text-white font-medium text-xs text-left">
                                        <span className="text-sec font-medium">GHOST</span> PRICE:
                                    </span>
                                    <span className="font-medium text-xs px-2 pb-0.5 text-sec">
                                        <div className="justify-center mx-auto items-center flex">
                                            <span className='pt-2'></span>
                                            <img src="/eth.png" alt="" className="h-4 w-4 -mb-0.5" />
                                            <span className='text-white -mb-0.5 px-0.5'>{ghostPrice}</span>
                                        </div>
                                    </span>
                                    <span className='mx-3'> | </span>
                                    <span className="text-white font-medium text-xs text-left">
                                        You own:
                                    </span>
                                    <span className="font-medium text-xs px-2 pb-0.5 text-sec">
                                        <div className="flex items-center">
                                            <span className="text-white pt-1">{shareHold}</span>
                                            <img src="/ghost.png" alt="" className="h-4 w-4 -mb-1.5 ml-1" />
                                        </div>
                                    </span>
                                </div>
                            </div>
                            <div className="justify-center mt-3.5 gap-10 items-center flex">
                                <button className='bg-sec hover:bg-sec/20 text-black rounded-xl px-24 py-1.5 font-bold' disabled={isBuying} onClick={openTxModal}>
                                    TRADE
                                </button>
                                {isTxModalOpen && (
                                    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10" >
                                        <div className="bg-black border border-white p-4 rounded-lg shadow-lg">
                                            <div className='flex items-center px-2.5'>
                                                <span className="text-white text-sm font-semibold text-center mx-8">
                                                    Trade <span className="font-extrabold">{userData.displayUsername}</span>'s<span className="text-sec font-bold px-1">GHOST</span></span>
                                                <button onClick={closeTxModal} className='border border-white bg-sec/20 hover:bg-sec rounded-full p-2 ml-auto'>
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M16.95 8.464a1 1 0 0 0-1.414-1.414L12 10.586 8.464 7.05A1 1 0 1 0 7.05 8.464L10.586 12 7.05 15.536a1 1 0 1 0 1.414 1.414L12 13.414l3.536 3.536a1 1 0 0 0 1.414-1.414L13.414 12l3.536-3.536Z" fill="#fff" className='' />
                                                    </svg>
                                                </button>
                                            </div>
                                            <div className='flex px-10 pt-2'>
                                                <div className="overflow-hidden">
                                                    <img
                                                        src={userData.pfpUrl}
                                                        width={30}
                                                        height={30}
                                                        className="rounded-full border border-sec"
                                                    />
                                                </div>
                                                <div className="justify-center gap-2 items-center text-center mx-auto flex">
                                                    <div className="flex items-center">
                                                        <span className="font-medium text-xs pb-0.5 text-sec">
                                                            <div className="justify-center mx-auto items-center flex">
                                                                <img src="/eth.png" alt="" className="h-4 w-4 -mb-0.5" />
                                                                <span className='text-white font-bold -mb-0.5 px-0.5'>{ghostPrice}</span>
                                                            </div>
                                                            <span className='text-[8px]'>GHOST<span className='text-white'> PRICE</span></span>
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="justify-center gap-2 items-center text-center mx-auto flex">
                                                    <div className="flex items-center">
                                                        <span className="font-medium text-xs pb-0.5 text-sec">
                                                            <div className="justify-center mx-auto items-center flex">
                                                                <span className="text-white font-bold -mb-0.5 px-0.5">You own: {shareHold}</span>
                                                                <img src="/ghost.png" alt="" className="h-4 w-4 -mb-1.5 ml-1" />
                                                            </div>
                                                            <span className='text-[8px]'>of<span className='text-white'> @{userData.username}</span></span>
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className='flex items-center justify-center mx-10 pt-2'>
                                                <button className='w-full bg-sec hover:bg-sec/20 rounded-xl px-10 py-1.5 font-bold' disabled={isBuying} onClick={() => buyTx(address, addressUser)}>
                                                    {isBuying === true ? "Buying..." : "BUY"}
                                                </button>
                                            </div>
                                            {isBuying === true && <div><p className="flex items-center justify-center text-green-500 font-light pt-0.5 pb-2">Loading...</p></div>}
                                            {isErrorBuying === true && <div>
                                                <p className="flex items-center justify-center text-red-500 font-light pt-0.5 pb-2">
                                                    Transaction error. Please try again.
                                                </p>
                                            </div>
                                            }
                                            {isSuccessBuying === true && <div><p className="flex items-center justify-center text-green-500 font-light pt-0.5 pb-2">Buy success!</p></div>}
                                            <div className='flex items-center justify-center mx-10 pt-3'>
                                                <button className='w-full bg-red-500 hover:bg-red-600 rounded-xl px-10 py-1.5 font-bold' disabled={isSelling} onClick={() => sellTx(address)}>
                                                    {isSelling === true ? "Selling..." : "SELL"}
                                                </button>
                                            </div>
                                            {isSelling === true && <div><p className="flex items-center justify-center text-green-500 font-light pt-0.5 pb-2">Loading...</p></div>}
                                            {isErrorSelling === true && <div>
                                                <p className="flex items-center justify-center text-red-500 font-light pt-0.5 pb-2">
                                                    Transaction error. Please try again.
                                                </p>
                                            </div>
                                            }
                                            {isSuccessSelling === true && <div><p className="flex items-center justify-center text-green-500 font-light pt-0.5 pb-2">Sell success!</p></div>}
                                            <div className="justify-center mx-auto items-center flex pt-3">
                                                <span className=' font-extralight text-xs text-center flex justify-center'>Sell Price: {ghostSellPrice}</span>
                                                <img src="/eth.png" alt="" className="h-3 w-3 -mb-0.5 mx-1" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center justify-center h-full pt-5 z-0">
                                <div className="group flex  items-center justify-center gap-1.5 border rounded-xl border-sec py-1 px-5">
                                    <span className="text-white font-semibold text-sm mt-0.5">Live Graph</span>
                                    <span className="relative -mr-2 flex h-2 w-2">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sec opacity-75"></span>
                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-sec"></span>
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center justify-center z-0 pt-3">
                                <LiveGraph data={tradeData} />
                            </div>
                            <div className='pt-32'></div>
                        </div>
                    ) : (
                        <div className="items-center justify-center pt-10">
                            <p className="text-red-500 text-center">
                                User data not found.
                            </p>
                            <div className="flex justify-center pt-8">
                                <a href='/app/explore'>
                                    <button className='border border-sec text-white rounded-xl font-light bg-slate-900 text-center px-3 hover:text-black hover:bg-white py-1'>Go back</button>
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            }
            <BottomBar />
        </div >
    );
};

export default AddressPage;
