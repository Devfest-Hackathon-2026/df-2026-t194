/**
 * モーダルやドロップダウンの外側をタップ・クリックして閉じる際、
 * 後続のクリック・タップイベントがマップに突き抜けて誤ってピンが刺さるのを防ぐガード
 */
let blockUntilTimestamp = 0;

export const blockMapPinTemporarily = (durationMs: number = 400): void => {
  blockUntilTimestamp = Date.now() + durationMs;
};

export const isMapPinBlocked = (): boolean => {
  return Date.now() < blockUntilTimestamp;
};
