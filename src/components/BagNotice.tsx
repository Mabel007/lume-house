import { useEffect } from "react";

export type BagNoticeMessage = { id: number; tone: "success" | "failure"; text: string };

const BAG_NOTICE_MS = 5000;

export function BagNotice({ message, onExpire }: { message: BagNoticeMessage | null; onExpire: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onExpire, BAG_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [message, onExpire]);
  return (
    <div className="bag-notice-region" role="status" aria-live="polite">
      {message && (
        <p key={message.id} className={`bag-notice ${message.tone}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
