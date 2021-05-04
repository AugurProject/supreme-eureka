import React, { useMemo, useState } from 'react';
import Styles from './activity.styles.less';
import { useAppStatusStore, useDataStore, useUserStore, Formatter, ProcessData, Links, PaginationComps } from '@augurproject/comps';
import { useSimplifiedStore } from 'modules/stores/simplified';
const { Pagination, sliceByPage } = PaginationComps;
const { ReceiptLink } = Links;
const { shapeUserActvity } = ProcessData;
const { getCashFormat } = Formatter;

const ActivityCard = ({ activity }: typeof React.Component) => (
  <div className={Styles.ActivityCard}>
    <div className={Styles.type}>{activity.type}</div>
    <div className={Styles.value}>{activity.value}</div>
    <div className={Styles.icon}>{getCashFormat(activity.currency).icon}</div>
    <span className={Styles.description}>{activity.description}</span>
    {activity.subheader && (
      <div className={Styles.subheader}>{activity.subheader}</div>
    )}
    <div className={Styles.time}>{activity.time}</div>
    {activity.txHash && <ReceiptLink hash={activity.txHash} />}
  </div>
);

const ACTIVITY_PAGE_LIMIT = 5;
export const Activity = () => {
  const { isLogged } = useAppStatusStore();
  const { account } = useUserStore();
  const { settings: { timeFormat }} = useSimplifiedStore();
  const { transactions, markets, cashes } = useDataStore();
  const activity = useMemo(
    () => shapeUserActvity(account, markets, transactions, cashes, timeFormat),
    [transactions, account, markets, cashes]
  );
  const [page, setPage] = useState(1);
  return (
    <div className={Styles.Activity}>
      <span>your activity</span>
      {isLogged && activity.length > 0 ? (
        <>
          <div>
            {sliceByPage(activity, page, ACTIVITY_PAGE_LIMIT).map(
              (activityGroup) => (
                <div key={activityGroup.date}>
                  <span>{activityGroup.date}</span>
                  <div>
                    {activityGroup.activity.map((activityItem) => (
                      <ActivityCard
                        key={`${activityItem.id}-${activityItem.currency}-${activityItem.type}-${activityItem.date}-${activityItem.time}`}
                        activity={activityItem}
                      />
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
          <Pagination
            page={page}
            itemCount={activity.length}
            itemsPerPage={ACTIVITY_PAGE_LIMIT}
            action={(page) => setPage(page)}
            updateLimit={() => null}
          />
        </>
      ) : (
        <span>No activity to show</span>
      )}
    </div>
  );
};
export default Activity;
