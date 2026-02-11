export const toBool = (value) =>
  value === true || value === "true" || value === 1 || value === "1";

const toStartOfDay = (value) => {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const addMonths = (dateValue, deltaMonths) => {
  const d = new Date(dateValue);
  return new Date(d.getFullYear(), d.getMonth() + deltaMonths, d.getDate());
};

export const buildAutoMailConfig = (license) => ({
  notifySixMonth: toBool(license.notify_six_month),
  notifyMonthly: toBool(license.notify_monthly),
  notifyDailyLast30: toBool(license.notify_daily_last_30)
});

export const shouldSendImmediateSixMonth = (license, now = new Date()) => {
  const expiryDate = toStartOfDay(license.expiry_date);
  const today = toStartOfDay(now);
  const sixMonthPoint = toStartOfDay(addMonths(expiryDate, -6));
  const daysLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

  return (
    buildAutoMailConfig(license).notifySixMonth &&
    !license.six_month_sent_at &&
    daysLeft >= 0 &&
    today >= sixMonthPoint
  );
};

export const getAutoMailTrigger = (license, now = new Date()) => {
  const expiryDate = toStartOfDay(license.expiry_date);
  const today = toStartOfDay(now);
  const sixMonthPoint = toStartOfDay(addMonths(expiryDate, -6));
  const daysLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
  const { notifySixMonth, notifyMonthly, notifyDailyLast30 } = buildAutoMailConfig(license);

  if (daysLeft < 0) {
    return { shouldSend: false, reason: null, markSixMonthSent: false };
  }

  if (notifySixMonth && !license.six_month_sent_at && today >= sixMonthPoint) {
    return { shouldSend: true, reason: "SIX_MONTH", markSixMonthSent: true };
  }

  if (
    notifyMonthly &&
    today >= sixMonthPoint &&
    daysLeft > 30 &&
    today.getDate() === 1
  ) {
    return { shouldSend: true, reason: "MONTHLY", markSixMonthSent: false };
  }

  if (notifyDailyLast30 && daysLeft <= 30) {
    return { shouldSend: true, reason: "DAILY_LAST_30", markSixMonthSent: false };
  }

  return { shouldSend: false, reason: null, markSixMonthSent: false };
};
