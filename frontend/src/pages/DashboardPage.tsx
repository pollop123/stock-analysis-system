import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import marketHeroBg from "@/assets/market-hero-bg.jpg";

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
    <main className="relative isolate -mx-4 -mt-4 min-h-[calc(100vh-5rem)] overflow-hidden px-4 py-10 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <div aria-hidden="true" className="market-hero-scene">
        <img src={marketHeroBg} alt="" className="market-hero-image" />
        <div className="market-hero-vignette" />
        <div className="market-hero-beam market-hero-beam-a" />
        <div className="market-hero-beam market-hero-beam-b" />
      </div>

      <section className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-4xl flex-col items-center justify-center text-center">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.28em] text-blue-200/80">
          AI Stock Research
        </p>

        <h1 className="max-w-3xl text-balance text-5xl font-black tracking-normal text-white md:text-7xl">
          TW Stock
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-200/90 md:text-xl">
          輸入代碼或公司名稱，整理價格走勢、基本面與投資重點。
        </p>

        <form onSubmit={handleSearch} className="mt-9 w-full">
          <div className="mx-auto flex min-h-16 max-w-2xl items-center gap-3 rounded-[1.35rem] border border-white/20 bg-slate-950/45 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
            <Search className="ml-3 h-5 w-5 shrink-0 text-blue-200" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="輸入 2330、0050 或台積電"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-base font-medium text-white outline-none placeholder:text-slate-300/70"
            />
            <button
              type="submit"
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-bold text-slate-950 transition-colors hover:bg-blue-100"
            >
              搜尋
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {EXAMPLE_SYMBOLS.map((symbol) => (
            <button
              key={symbol}
              type="button"
              onClick={() => searchExample(symbol)}
              className="rounded-full border border-white/15 bg-slate-950/35 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur transition-colors hover:border-white/35 hover:bg-white/10"
            >
              {symbol}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
