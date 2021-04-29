import { TWELVE_HOUR_TIME, TWENTY_FOUR_HOUR_TIME } from "./constants";

const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

export const getDayFormat = (timestamp) => {
  if (!timestamp) return "N/A";
  const inMilli = Number(timestamp) * 1000;
  const date = new Date(inMilli);
  const day = `0${date.getDate()}`.slice(-2);
  const mon = shortMonths[Number(date.getMonth())];
  return `${mon} ${day}`;
};

export const getTimeFormat = (timestamp, format = TWENTY_FOUR_HOUR_TIME) => {
  if (!timestamp) return "N/A";
  const inMilli = Number(timestamp) * 1000;
  const date = new Date(inMilli);
  return date.toLocaleDateString("en-us", {
    hour: "numeric",
    minute: "numeric",
    hour12: format === TWELVE_HOUR_TIME,
  });
};

export const getMarketEndtimeDate = (timestamp: string | number) => {
  const inMilli = Number(timestamp) * 1000;
  const date = new Date(inMilli);
  const year = date.getFullYear();
  const monthDay = getDayFormat(timestamp);
  return `${monthDay}, ${year}`;
};

export const getMarketEndtimeFull = (timestamp: string | number, format = TWENTY_FOUR_HOUR_TIME) => {
  if (!timestamp) return "Missing";
  // use existing to make sure to be consistent
  const monthDayYear = getMarketEndtimeDate(timestamp);
  const timeHour = getTimeFormat(timestamp, format);
  const offset = getTimestampTimezoneOffSet(timestamp);
  return `${monthDayYear} ${timeHour} ${offset}`;
};

const getTimestampTimezoneOffSet = (timestamp: string | number) => {
  const inMilli = Number(timestamp) * 1000;
  const date = new Date(inMilli);
  // timezone offset comes in minutes
  const timezone = date.getTimezoneOffset() / 60;
  const direction = timezone > 0 ? "+" : "-";
  return `(UTC${direction}${Math.abs(timezone)})`;
};

export const getDayTimestamp = (timestamp: string) => {
  const inMilli = Number(timestamp) * 1000;
  const date = new Date(inMilli);
  const day = `0${date.getDate()}`.slice(-2);
  const mon = `0${Number(date.getMonth()) + 1}`.slice(-2);
  const year = date.getFullYear();
  return Number(`${year}${mon}${day}`);
};
