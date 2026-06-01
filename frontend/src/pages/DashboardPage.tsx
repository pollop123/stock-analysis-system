import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import marketHeroBg from "@/assets/market-hero-bg.jpg";
import marketHeroLightBg from "@/assets/market-hero-light.jpg";

const EXAMPLE_SYMBOLS = ["2330", "2317", "0050"];

export function DashboardPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = searchQuery.trim();
    if (!trimmed) {
      navigate("/stocks");
      return;
    }

    const params = new URLSearchParams({ q: trimmed });
    navigate(`/stocks?${params.toString()}`);
  };

  const searchExample = (symbol: string) => {
    navigate(`/stocks/${symbol}`);
  };

  return (
    <main className="homepage-hero relative isolate -mx-4 -mt-4 min-h-[calc(100vh-5rem)] overflow-hidden px-4 py-10 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <div aria-hidden="true" className="market-hero-scene">
        <img src={marketHeroLightBg} alt="" className="market-hero-image market-hero-image-light" />
        <img src={marketHeroBg} alt="" className="market-hero-image market-hero-image-dark" />
        <div className="market-hero-vignette" />
        <div className="market-hero-beam market-hero-beam-a" />
        <div className="market-hero-beam market-hero-beam-b" />
      </div>

      <section className="homepage-hero-content mx-auto flex min-h-[calc(100vh-10rem)] max-w-5xl flex-col justify-center">
        <p className="homepage-hero-kicker mb-5 text-xs font-semibold uppercase tracking-[0.28em] dark:text-blue-200/80">
          AI Stock Research
        </p>

        <h1 className="homepage-hero-title max-w-3xl text-balance text-5xl font-black tracking-normal dark:text-white md:text-7xl">
          TW Stock
        </h1>
        <p className="homepage-hero-copy mt-5 max-w-2xl text-base font-medium leading-7 md:text-xl dark:text-slate-200/90">
          輸入代碼或公司名稱，整理價格走勢、基本面與投資重點。
        </p>

        <form onSubmit={handleSearch} className="mt-9 w-full">
          <div className="homepage-search-box flex min-h-16 max-w-2xl items-center gap-3 rounded-[1.35rem] border border-slate-950/15 bg-white/92 p-2 backdrop-blur-xl dark:border-white/20 dark:bg-slate-950/45 dark:shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
            <Search className="ml-3 h-5 w-5 shrink-0 text-slate-950 dark:text-blue-200" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="輸入 2330、0050 或台積電"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-950 outline-none placeholder:text-slate-800 dark:text-white dark:placeholder:text-slate-300/70"
            />
            <button
              type="submit"
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-bold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-100"
            >
              搜尋
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>

        <div className="homepage-example-list mt-5 flex flex-wrap items-center gap-2">
          {EXAMPLE_SYMBOLS.map((symbol) => (
            <button
              key={symbol}
              type="button"
              onClick={() => searchExample(symbol)}
              className="rounded-full border border-slate-950/25 bg-white/82 px-3 py-1.5 text-xs font-bold text-slate-950 backdrop-blur transition-colors hover:border-slate-950/45 hover:bg-white dark:border-white/15 dark:bg-slate-950/35 dark:text-slate-200 dark:hover:border-white/35 dark:hover:bg-white/10"
            >
              {symbol}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
