import React, { useState, useEffect } from 'react';
import Styles from './portfolio-view.styles.less';
import Activity from './activity';
import { PositionsLiquidityViewSwitcher } from '../common/tables';
import { AppViewStats, NetworkMismatchBanner } from '../common/labels';
import {
  ContractCalls,
  Formatter,
  Icons,
  Constants,
  createBigNumber,
  Stores,
  SEO,
  ButtonComps,
} from '@augurproject/comps';
import { PORTFOLIO_HEAD_TAGS } from '../seo-config';
import { Cash } from '@augurproject/comps/build/types';

const { claimWinnings, claimFees } = ContractCalls;
const { formatCash } = Formatter;
const { ACTIVITY, ETH, TABLES, TX_STATUS, USDC } = Constants;
const {
  Hooks: {
    useDataStore,
    useAppStatusStore,
    useScrollToTopOnMount,
    useUserStore,
  },
  Utils: { keyedObjToArray },
} = Stores;
const { EthIcon, UsdIcon } = Icons;
const { PrimaryButton } = ButtonComps;

const calculateTotalWinnings = (claimbleMarketsPerCash) => {
  let total = createBigNumber('0');
  let ids = [];
  let factories = [];
  claimbleMarketsPerCash.forEach(
    ({
      ammExchange: { turboId, marketFactoryAddress },
      claimableWinnings: { claimableBalance },
    }) => {
      total = total.plus(createBigNumber(claimableBalance));
      // @ts-ignore
      ids.push(turboId);
      factories.push(marketFactoryAddress);
    }
  );
  return {
    hasWinnings: !total.eq(0),
    total,
    ids,
    factories,
  };
};

export const getClaimAllMessage = (cash: Cash): string => `Claim All ${cash?.name} Winnings`;
export const getClaimFeesMessage = (cash: Cash): string => `Claim All ${cash?.name} Fees`;

const handleClaimAll = (
  loginAccount,
  cash,
  ids,
  factories,
  addTransaction,
  canClaim,
  setPendingClaim
) => {
  const from = loginAccount?.account;
  const chainId = loginAccount?.chainId;
  if (from && canClaim) {
    setPendingClaim(true);
    claimWinnings(from, loginAccount?.library, ids, factories)
      .then(response => {
        // handle transaction response here
        setPendingClaim(false);
        if (response) {
          const { hash } = response;
          addTransaction({
            hash,
            chainId,
            seen: false,
            status: TX_STATUS.PENDING,
            from,
            addedTime: new Date().getTime(),
            message: getClaimAllMessage(cash),
            marketDescription: '',
          });
        }
      })
      .catch(error => {
        setPendingClaim(false);
        console.log('Error when trying to claim winnings: ', error?.message);
      });
  } 
};

const handleClaimFees = (
  loginAccount,
  cash,
  ids,
  factories,
  addTransaction,
  canClaim,
  setPendingClaimFees
) => {
  const from = loginAccount?.account;
  const chainId = loginAccount?.chainId;
  if (from && canClaim) {
    setPendingClaimFees(true);
    claimFees(from, loginAccount?.library, factories)
      .then(response => {
        // handle transaction response here
        setPendingClaimFees(false);
        if (response) {
          const { hash } = response;
          addTransaction({
            hash,
            chainId,
            seen: false,
            status: TX_STATUS.PENDING,
            from,
            addedTime: new Date().getTime(),
            message: getClaimFeesMessage(cash),
            marketDescription: '',
          });
        }
      })
      .catch(error => {
        setPendingClaimFees(false);
        console.log('Error when trying to claim winnings: ', error?.message);
      });
  } 
};

export const ClaimWinningsSection = () => {
  const { isLogged } = useAppStatusStore();
  const {
    balances: { marketShares, claimableFees },
    loginAccount,
    transactions,
    actions: { addTransaction },
  } = useUserStore();
  const [pendingClaim, setPendingClaim] = useState(false);
  const [pendingClaimFees, setPendingClaimFees] = useState(false);
  const { cashes } = useDataStore();
  const claimableMarkets = marketShares
    ? keyedObjToArray(marketShares).filter((m) => !!m?.claimableWinnings)
    : [];
  const keyedCash = keyedObjToArray(cashes);
  const ethCash = keyedCash.find((c) => c?.name === ETH);
  const usdcCash = keyedCash.find((c) => c?.name === USDC);
  const claimableEthMarkets = claimableMarkets.filter(
    (m) => m.claimableWinnings.sharetoken === ethCash?.shareToken
  );
  const ETHTotals = calculateTotalWinnings(claimableEthMarkets);
  const USDCTotals = calculateTotalWinnings(claimableMarkets);
  // const canClaimETH = useCanExitCashPosition(ethCash);
  const canClaimETH = true;
  const hasClaimableFees = createBigNumber(claimableFees || "0").gt(0);
  const disableClaimUSDCWins =
  pendingClaim ||
    Boolean(transactions.find((t) => t.message === getClaimAllMessage(usdcCash) && t.status === TX_STATUS.PENDING));
  const disableClaimUSDCFees =
  pendingClaimFees ||
      Boolean(transactions.find((t) => t.message === getClaimFeesMessage(usdcCash) && t.status === TX_STATUS.PENDING));

  return (
    <div className={Styles.ClaimableWinningsSection}>
      {isLogged && USDCTotals.hasWinnings && (
        <PrimaryButton
          text={
            !pendingClaim
              ? `Claim Winnings (${
                  formatCash(USDCTotals.total, usdcCash?.name).full
                })`
              : `Waiting for Confirmation`
          }
          subText={pendingClaim && `(Confirm this transaction in your wallet)`}
          disabled={disableClaimUSDCWins}
          icon={!pendingClaim && UsdIcon}
          action={() => {
            handleClaimAll(
              loginAccount,
              usdcCash,
              USDCTotals.ids,
              USDCTotals.factories,
              addTransaction,
              true,
              setPendingClaim
            );
          }}
        />
      )}
      {isLogged && ETHTotals.hasWinnings && (
        <PrimaryButton
          text={`${canClaimETH ? '' : 'Approve to '}Claim Winnings (${
            formatCash(ETHTotals.total, ethCash?.name).full
          })`}
          icon={EthIcon}
          action={() => {
            handleClaimAll(
              loginAccount,
              ethCash,
              ETHTotals.ids,
              ETHTotals.factories,
              addTransaction,
              canClaimETH,
              setPendingClaim
            );
          }}
        />
      )}
      {isLogged && hasClaimableFees && (
        <PrimaryButton
          text={!pendingClaimFees ? `Claim Fees (${
            formatCash(claimableFees, USDC).full
          })` : `Waiting for Confirmation`}
          disabled={disableClaimUSDCFees}
          action={() => {
            handleClaimFees(
              loginAccount,
              usdcCash,
              USDCTotals.ids,
              USDCTotals.factories,
              addTransaction,
              true,
              setPendingClaimFees
            );
          }}
        />
      )}
    </div>
  );
};

export const PortfolioView = () => {
  const { isMobile } = useAppStatusStore();
  const [view, setView] = useState(TABLES);

  useScrollToTopOnMount();

  useEffect(() => {
    if (!isMobile) setView(TABLES);
  }, [isMobile]);

  return (
    <div className={Styles.PortfolioView}>
      <SEO {...PORTFOLIO_HEAD_TAGS} />
      <section>
        <NetworkMismatchBanner />
        <AppViewStats small />
        <ClaimWinningsSection />
        <PositionsLiquidityViewSwitcher
          showActivityButton={isMobile}
          setTables={() => setView(TABLES)}
          setActivity={() => setView(ACTIVITY)}
          view={view}
          claimableFirst
        />
        {view === ACTIVITY && <Activity />}
      </section>
      <section>
        <Activity />
      </section>
    </div>
  );
};

export default PortfolioView;
