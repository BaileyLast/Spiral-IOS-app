import { useState } from "react";
import { Check, Copy, Instagram, ShieldCheck } from "lucide-react";

export function PostStoryCard() {
  const rawHandle = "glossier";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`@${rawHandle}`);
    } catch {
      // ignore
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F2EC] p-6 font-['Inter']">
      <div className="w-full max-w-[360px]">
        <div
          className="relative overflow-hidden rounded-3xl p-6 text-white text-center"
          style={{
            background:
              "linear-gradient(135deg, #4ECCA3 0%, #3DB893 55%, #2FA17E 100%)",
            boxShadow:
              "0 10px 30px rgba(46, 161, 126, 0.25), inset 0 -6px 0 rgba(0,0,0,0.08)",
          }}
        >
          <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4 pointer-events-none">
            <Instagram className="w-32 h-32" />
          </div>

          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-[#4ECCA3] shadow-lg mb-4">
              <Instagram className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black mb-2 leading-tight">
              Post your Story,
              <br />
              unlock your next discount.
            </h2>
            <p className="text-[#E6F8F0] font-medium text-sm mb-6 max-w-[280px]">
              Showcase your new purchase and tag{" "}
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 font-bold text-white underline underline-offset-2 decoration-white/70 hover:decoration-white active:opacity-80"
                aria-label={copied ? "Handle copied" : `Copy @${rawHandle}`}
              >
                @{rawHandle}
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5 opacity-80" />
                )}
              </button>{" "}
              in a public Story to unlock more discounts from your favourite
              stores.
            </p>

            <a
              href={`https://instagram.com/${rawHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-4 text-lg font-semibold rounded-2xl bg-white text-[#4ECCA3] text-center"
              style={{
                boxShadow:
                  "0 4px 12px rgba(0,0,0,0.1), inset 0 -4px 0 rgba(240,240,240,1)",
              }}
            >
              Open Instagram
            </a>

            <div className="mt-4 flex items-center gap-1.5 text-[#E6F8F0] text-xs font-medium bg-black/10 px-3 py-1.5 rounded-full">
              <ShieldCheck className="w-4 h-4" />
              <span>Public Stories only — Close Friends won't count</span>
            </div>

            <div
              className={`mt-3 text-xs text-white/90 transition-opacity ${copied ? "opacity-100" : "opacity-0"}`}
              aria-live="polite"
            >
              Copied @{rawHandle} to clipboard
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
