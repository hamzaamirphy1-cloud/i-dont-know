"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  LayoutGrid,
  ShoppingBag,
  Code2,
  Users,
  LogOut,
  ChevronDown,
  Plus,
  Check,
  ShieldCheck,
  SlidersHorizontal,
  HeartPulse,
  GraduationCap,
  House,
  UtensilsCrossed,
  Workflow,
  X,
  Download,
  Globe,
  LoaderCircle,
  AlertCircle,
  Upload,
  FileText,
  Sparkles,
  ExternalLink,
  Menu,
  CheckCircle2,
} from "lucide-react";

type User = {
  id: string;
  name: string;
  email: string;
  role: "buyer" | "builder" | "admin";
  disabled?: boolean;
};
type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  technology: string[];
  features: string[];
  screenshots: string[];
  price_cents: number;
  revision: number;
  license: string;
  status: string;
  audit_status: string;
  audit_findings: string;
  review_note: string;
  reviewed_at: string | null;
  sample: boolean;
  accent: string;
  seller_name: string;
  seller_id: string;
  repository: string;
  download_available: boolean;
};
type Order = {
  id: string;
  name: string;
  product_id: string;
  total_cents: number;
  status: string;
  created_at: string;
  download_available: boolean;
  license_snapshot: string;
};
type HelpRequest = {
  id: string;
  kind: string;
  description: string;
  status: string;
  admin_note: string;
  created_at: string;
  product_name?: string;
  user_name?: string;
};
type Workspace = {
  products: Product[];
  orders: Order[];
  requests: HelpRequest[];
};
type Admin = {
  products: Product[];
  users: User[];
  requests: HelpRequest[];
  actions: {
    id: string;
    admin_name: string;
    action: string;
    details: string;
    created_at: string;
  }[];
};
type Dialog =
  | { kind: "auth"; mode: "login" | "register"; intent?: "sell" }
  | { kind: "seller"; id: string; name: string }
  | { kind: "detail"; product: Product }
  | { kind: "submit"; product?: Product }
  | { kind: "review"; product: Product }
  | { kind: "artifact"; product: Product }
  | { kind: "agent"; name: "Vi" | "Remi" | "Axel" | "Nova" }
  | { kind: "help"; type?: string; product?: string }
  | null;
const categoryNames = [
  "All projects",
  "Healthcare",
  "E-commerce",
  "Education",
  "Productivity",
  "Food & Restaurant",
  "Real Estate",
];
const categoryBn = [
  "সব প্রজেক্ট",
  "স্বাস্থ্যসেবা",
  "ই-কমার্স",
  "শিক্ষা",
  "উৎপাদনশীলতা",
  "রেস্তোরাঁ",
  "রিয়েল এস্টেট",
];
const categoryIcons = [
  LayoutGrid,
  HeartPulse,
  ShoppingBag,
  GraduationCap,
  Workflow,
  UtensilsCrossed,
  House,
];
const money = (c: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(c / 100);
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error || "Request failed. Please try again.");
  return data;
}
const send = <T,>(url: string, body: unknown, method = "POST") =>
  api<T>(url, { method, body: JSON.stringify(body) });
function Modal({
  children,
  onClose,
  label,
  closeLabel,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  closeLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onClose);
  callback.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const background = Array.from(
      document.querySelectorAll<HTMLElement>("main, aside.sidebar"),
    );
    const priorInert = background.map((el) => el.inert);
    background.forEach((el) => {
      el.inert = true;
    });
    ref.current?.querySelector<HTMLElement>("button,input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") callback.current();
      if (e.key === "Tab") {
        const all = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button,a[href],input,select,textarea,summary,[tabindex]",
          ) || [],
        ).filter(
          (el) =>
            el.tabIndex >= 0 &&
            !el.matches(":disabled") &&
            el.getClientRects().length > 0,
        );
        if (!all?.length) return;
        const first = all[0],
          last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = old;
      background.forEach((el, i) => {
        el.inert = priorInert[i];
      });
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        ref={ref}
      >
        <button className="close" aria-label={closeLabel} onClick={onClose}>
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}
function Preview({
  p,
  large = false,
  lang = "en",
}: {
  p: Product;
  large?: boolean;
  lang?: "en" | "bn";
}) {
  const Icon =
    categoryIcons[Math.max(1, categoryNames.indexOf(p.category))] || Code2;
  return (
    <div
      className={`preview ${p.accent || "mint"} ${large ? "large-preview" : ""}`}
    >
      <span className="sample-badge">
        {lang === "bn"
          ? p.sample
            ? "নমুনা প্রজেক্ট"
            : "প্রজেক্ট প্রিভিউ"
          : p.sample
            ? "SAMPLE PROJECT"
            : "PROJECT PREVIEW"}
      </span>
      <div className="product-wordmark">
        <Icon size={25} />
        {p.name}
        <small>
          {lang === "bn"
            ? `${categoryBn[categoryNames.indexOf(p.category)] || p.category} · আপনার নতুন যাত্রার জন্য`
            : `${p.category.toUpperCase()} · MADE FOR YOUR NEXT CHAPTER`}
        </small>
      </div>
      <div className="mock-window">
        <div className="mock-nav">
          <i />
          <i />
          <i />
        </div>
        <div className="mock-body">
          <div className="mock-side">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="mock-main">
            <div className="mock-title" />
            <div className="mock-stats">
              <i />
              <i />
              <i />
            </div>
            <div className="mock-chart">
              {[30, 55, 42, 76, 60, 90, 72, 98, 85, 110].map((h, i) => (
                <i key={i} style={{ height: h + "%" }} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <span className="visual-arrow">
        <ArrowUpRight size={14} />
      </span>
    </div>
  );
}
export default function Marketplace() {
  const [lang, setLang] = useState<"en" | "bn">("en");
  const t = (en: string, bn: string) => (lang === "en" ? en : bn);
  const cat = (c: string) =>
    lang === "en" ? c : categoryBn[categoryNames.indexOf(c)] || c;
  const [user, setUser] = useState<User | null>(null),
    [page, setPage] = useState<"market" | "workspace" | "admin">("market");
  const [products, setProducts] = useState<Product[]>([]),
    [category, setCategory] = useState("All projects"),
    [query, setQuery] = useState(""),
    [technology, setTechnology] = useState(""),
    [maxPrice, setMaxPrice] = useState(""),
    [sort, setSort] = useState("new");
  const [config, setConfig] = useState({
      payments: false,
      ai: false,
      deployment: false,
      sourceStorage: true,
      maxUploadBytes: 10 * 1024 * 1024,
    }),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [dialog, setDialog] = useState<Dialog>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
    [admin, setAdmin] = useState<Admin | null>(null),
    [revision, setRevision] = useState(0),
    [mobileOpen, setMobileOpen] = useState(false),
    [adminTab, setAdminTab] = useState("projects");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  function toast(text: string) {
    setMessage(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(""), 5500);
  }
  function open(d: Dialog) {
    setError("");
    setDialog(d);
    setMobileOpen(false);
  }
  function refresh() {
    setRevision((r) => r + 1);
  }
  function navigate(p: typeof page) {
    setPage(p);
    setLoadError("");
    setMobileOpen(false);
    window.scrollTo(0, 0);
  }
  useEffect(() => {
    const saved = localStorage.getItem("vibe96-language");
    if (saved === "bn") setLang("bn");
    const keys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("keydown", keys);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem("vibe96-language", lang);
  }, [lang]);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ user: User | null }>("/api/auth/me"),
      api<typeof config>("/api/config"),
    ])
      .then(([a, b]) => {
        if (!active) return;
        setUser(a.user);
        setConfig(b);
        const checkout = new URLSearchParams(location.search).get("checkout");
        if (checkout) {
          setPage("workspace");
          toast(
            checkout === "returned"
              ? t(
                  "Returned from Stripe. Only a verified webhook can confirm payment.",
                  "Stripe থেকে ফিরেছেন। যাচাইকৃত ওয়েবহুক ছাড়া পেমেন্ট নিশ্চিত হয় না।",
                )
              : t(
                  "Checkout was cancelled. No download has been granted.",
                  "চেকআউট বাতিল হয়েছে। ডাউনলোডের অনুমতি দেওয়া হয়নি।",
                ),
          );
          history.replaceState({}, "", location.pathname);
        }
      })
      .catch((e) => {
        if (active) setLoadError(e.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  useEffect(() => {
    if (page !== "market") return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ sort });
      if (query) params.set("q", query);
      if (category !== "All projects") params.set("category", category);
      if (technology) params.set("technology", technology);
      if (maxPrice) params.set("maxPrice", maxPrice);
      api<{ products: Product[] }>("/api/products?" + params, {
        signal: controller.signal,
      })
        .then((b) => setProducts(b.products))
        .catch((e) => {
          if (e.name !== "AbortError") setLoadError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, category, technology, maxPrice, sort, page, revision]);
  useEffect(() => {
    if (page === "market") return;
    if (!user) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError("");
    api<Workspace | Admin>(page === "admin" ? "/api/admin" : "/api/workspace")
      .then((b) => {
        if (active) {
          if (page === "admin") setAdmin(b as Admin);
          else setWorkspace(b as Workspace);
        }
      })
      .catch((e) => {
        if (active) setLoadError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, user, revision]);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  function wantSubmit(p?: Product) {
    if (!user) return open({ kind: "auth", mode: "register", intent: "sell" });
    if (user.role === "buyer")
      return toast(
        t(
          "A builder account is required to submit projects.",
          "প্রজেক্ট জমা দিতে বিল্ডার অ্যাকাউন্ট প্রয়োজন।",
        ),
      );
    open({ kind: "submit", product: p });
  }
  async function logout() {
    try {
      await send("/api/auth/logout", {});
      setUser(null);
      setWorkspace(null);
      setAdmin(null);
      navigate("market");
      refresh();
    } catch (e) {
      toast((e as Error).message);
    }
  }
  async function buy(p: Product) {
    if (!user) return open({ kind: "auth", mode: "login" });
    await perform(async () => {
      const result = await send<{ url: string }>("/api/checkout", {
        product_id: p.id,
      });
      const url = new URL(result.url);
      if (url.hostname !== "checkout.stripe.com")
        throw Error("Unexpected checkout URL.");
      location.assign(url.href);
    });
  }
  function stats() {
    return (
      <div className="dash-stats">
        <div>
          <b>
            {workspace?.orders.filter((o) => o.status === "paid").length || 0}
          </b>
          <span>{t("Licensed purchases", "লাইসেন্সকৃত ক্রয়")}</span>
        </div>
        <div>
          <b>{workspace?.products.length || 0}</b>
          <span>{t("Builder projects", "বিল্ডার প্রজেক্ট")}</span>
        </div>
        <div>
          <b>{workspace?.requests.length || 0}</b>
          <span>{t("Support requests", "সাহায্যের অনুরোধ")}</span>
        </div>
      </div>
    );
  }
  const statusLabel = (s: string) =>
    ({
      pending: t("Awaiting review", "রিভিউয়ের অপেক্ষায়"),
      approved: t("Published", "প্রকাশিত"),
      rejected: t("Changes requested", "পরিবর্তন প্রয়োজন"),
      paid: t("Payment confirmed", "পেমেন্ট নিশ্চিত"),
      failed: t("Payment failed", "পেমেন্ট ব্যর্থ"),
      refunded: t("Refunded", "ফেরত দেওয়া হয়েছে"),
      submitted: t("Submitted", "জমা হয়েছে"),
      in_review: t("In review", "রিভিউ চলছে"),
      completed: t("Completed", "সম্পন্ন"),
      closed: t("Closed", "বন্ধ"),
    })[s] || s;
  const formError = (
    <>
      {error && (
        <div className="form-error flex items-start gap-2" role="alert">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
    </>
  );
  const submitButton = (label: string, unavailable = false) => (
    <button
      type="submit"
      className="primary flex items-center justify-center gap-2"
      disabled={busy || unavailable}
    >
      {busy ? <LoaderCircle className="animate-spin" size={16} /> : null}
      {label}
      <ArrowRight size={15} />
    </button>
  );
  return (
    <>
      <aside
        id="main-navigation"
        className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
      >
        <button
          className="logo"
          onClick={() => navigate("market")}
          aria-label="Vibe96 home"
        >
          <span className="logo-symbol">
            v<span>✦</span>
          </span>
          vibe<span className="logo-number">96</span>
          <span className="logo-dot">.</span>
        </button>
        <div className="workspace">{t("THE LAUNCHPAD", "আপনার লঞ্চপ্যাড")}</div>
        <nav>
          <button
            className={`nav-item ${page === "market" ? "active" : ""}`}
            onClick={() => navigate("market")}
          >
            <LayoutGrid size={18} />
            <span>{t("Explore projects", "প্রজেক্ট দেখুন")}</span>
          </button>
          <button
            className={`nav-item ${page === "workspace" ? "active" : ""}`}
            onClick={() => navigate("workspace")}
          >
            <ShoppingBag size={18} />
            <span>{t("My workspace", "আমার ওয়ার্কস্পেস")}</span>
          </button>
          <button className="nav-item" onClick={() => open({ kind: "help" })}>
            <Users size={18} />
            <span>{t("Expert help", "বিশেষজ্ঞের সাহায্য")}</span>
            <span className="new">{t("NEW", "নতুন")}</span>
          </button>
          {user?.role === "admin" && (
            <button
              className={`nav-item ${page === "admin" ? "active" : ""}`}
              onClick={() => navigate("admin")}
            >
              <ShieldCheck size={18} />
              <span>{t("Admin studio", "অ্যাডমিন স্টুডিও")}</span>
            </button>
          )}
        </nav>
        <div className="nav-label">
          {t("YOUR AI CREW", "আপনার AI টিম")}{" "}
          <span className="crew-offline">{t("GUIDED", "গাইড")}</span>
        </div>
        {(["Vi", "Remi", "Axel", "Nova"] as const).map((name, i) => (
          <button
            key={name}
            className="agent"
            onClick={() => open({ kind: "agent", name })}
          >
            <span className={`avatar ${name.toLowerCase()}`}>
              {name[0].toLowerCase()}
            </span>
            <span>
              <b>{name}</b>
              <small>
                {
                  [
                    t("Your buying sidekick", "কেনার গাইড"),
                    t("Your builder partner", "বিল্ডার সঙ্গী"),
                    t("Deployment, explained", "ডেপ্লয়মেন্ট গাইড"),
                    t("Make it your own", "কাস্টমাইজেশন গাইড"),
                  ][i]
                }
              </small>
            </span>
            <ArrowUpRight size={12} />
          </button>
        ))}
        <div className="sidebar-bottom">
          <div className="builder-box">
            <Sparkles size={22} />
            <h3>{t("Built something cool?", "দারুণ কিছু বানিয়েছেন?")}</h3>
            <p>
              {t(
                "Your next chapter starts with your first sale.",
                "আপনার প্রথম বিক্রয় দিয়ে শুরু হোক নতুন অধ্যায়।",
              )}
            </p>
            <button onClick={() => wantSubmit()}>
              {t("Become a builder", "বিল্ডার হোন")} <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="profile">
            <span className="profile-icon">{user?.name[0] || "G"}</span>
            <div>
              <b>{user?.name || t("Welcome, explorer", "স্বাগতম")}</b>
              <small>
                {user?.role ||
                  t("Find your next big thing", "আপনার পরের আইডিয়া খুঁজুন")}
              </small>
            </div>
            {user ? (
              <button
                title={t("Sign out", "সাইন আউট")}
                aria-label={t("Sign out", "সাইন আউট")}
                onClick={logout}
              >
                <LogOut size={15} />
              </button>
            ) : (
              <button onClick={() => open({ kind: "auth", mode: "login" })}>
                <ArrowRight size={16} />
                <span className="sr-only">Sign in</span>
              </button>
            )}
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="flex items-center gap-3">
            <button
              className="mobile-menu"
              aria-label={t("Toggle navigation", "নেভিগেশন খুলুন বা বন্ধ করুন")}
              aria-expanded={mobileOpen}
              aria-controls="main-navigation"
              onClick={() => setMobileOpen((v) => !v)}
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              {t("Marketplace", "মার্কেটপ্লেস")} <span>/</span>
              <b>
                {page === "market"
                  ? t("Explore projects", "প্রজেক্ট দেখুন")
                  : page === "admin"
                    ? t("Admin studio", "অ্যাডমিন স্টুডিও")
                    : t("My workspace", "আমার ওয়ার্কস্পেস")}
              </b>
            </div>
          </div>
          <div className="header-right">
            <button
              className="language"
              onClick={() => setLang((l) => (l === "en" ? "bn" : "en"))}
              aria-label="Change language"
            >
              <Globe size={13} />
              {lang === "en" ? "বাংলা" : "English"}
            </button>
            <span className="status-dot" />
            <span>{t("Local MVP", "স্থানীয় MVP")}</span>
            {!user && (
              <button
                className="text-button signin"
                onClick={() => open({ kind: "auth", mode: "login" })}
              >
                {t("Sign in", "সাইন ইন")}
              </button>
            )}
            <button className="sell-button" onClick={() => wantSubmit()}>
              <Plus size={14} />
              {t("Sell a project", "প্রজেক্ট বিক্রি করুন")}
            </button>
          </div>
        </header>
        {page === "market" ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span />
                  {t(
                    "LESS BUILDING. MORE LAUNCHING.",
                    "কম সময়ে তৈরি। দ্রুত লঞ্চ।",
                  )}
                </div>
                <h1>
                  {t("Your next big thing.", "আপনার পরের বড় আইডিয়া।")}
                  <br />
                  <span>{t("Already built.", "ইতিমধ্যেই তৈরি।")}</span>
                </h1>
                <p>
                  {t(
                    "Discover ready-to-launch software, crafted by builders.",
                    "বিল্ডারদের তৈরি সফটওয়্যার খুঁজে নিন।",
                  )}
                  <br />
                  {t(
                    "Find your fit. Make it yours. Go live.",
                    "পছন্দ করুন। নিজের মতো করুন। লঞ্চ করুন।",
                  )}
                </p>
                <div className="hero-trust">
                  <span>
                    <Check size={12} />
                    {t("Transparent reviews", "স্বচ্ছ রিভিউ")}
                  </span>
                  <span>
                    <Check size={12} />
                    {t("Source-first software", "সোর্সসহ সফটওয়্যার")}
                  </span>
                  <span>
                    <Check size={12} />
                    {t("One-time licenses", "এককালীন লাইসেন্স")}
                  </span>
                </div>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <span className="spark spark-one">✦</span>
                <span className="spark spark-two">✧</span>
                <div className="art-chip chip-code">
                  <Code2 size={18} />
                  <span>From code</span>
                </div>
                <div className="art-card">
                  <div className="art-card-top">
                    <span className="mini-logo">v✦</span>
                    <span className="art-dots">•••</span>
                  </div>
                  <div className="art-bars">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="art-grid">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="art-card-bottom">
                    <span>Ready for your next chapter</span>
                    <ArrowUpRight size={15} />
                  </div>
                </div>
                <div className="art-chip chip-launch">
                  <span className="launch-icon">
                    <ArrowUpRight size={20} />
                  </span>
                  <div>
                    <b>Ready for what’s next</b>
                    <small>Your idea. A head start.</small>
                  </div>
                  <span className="chip-check">✓</span>
                </div>
              </div>
            </section>
            <section className="discovery">
              <div className="section-heading">
                <div>
                  <h2>
                    {t("Find your head start", "আপনার যাত্রা শুরু করুন")}{" "}
                    <span>✦</span>
                  </h2>
                  <p>
                    {t(
                      "Good software. Great possibilities.",
                      "ভালো সফটওয়্যার। অসীম সম্ভাবনা।",
                    )}
                  </p>
                </div>
                <span className="curated">
                  <Sparkles size={12} />
                  {t(
                    "A fresh start for your next move",
                    "আপনার নতুন যাত্রার শুরু",
                  )}
                </span>
              </div>
              <div className="filter-top">
                <label className="search">
                  <Search size={17} />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t(
                      "Search projects, ideas, or possibilities...",
                      "প্রজেক্ট, আইডিয়া বা প্রযুক্তি খুঁজুন...",
                    )}
                    aria-label={t("Search projects", "প্রজেক্ট খুঁজুন")}
                  />
                  <kbd>⌘ K</kbd>
                </label>
                <label className="sort">
                  {t("Sort by:", "সাজান:")}
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    aria-label="Sort projects"
                  >
                    <option value="new">{t("Newest first", "নতুন আগে")}</option>
                    <option value="low">
                      {t("Price: low to high", "দাম: কম থেকে বেশি")}
                    </option>
                    <option value="high">
                      {t("Price: high to low", "দাম: বেশি থেকে কম")}
                    </option>
                  </select>
                </label>
              </div>
              <div className="categories">
                {categoryNames.map((c, i) => {
                  const Icon = categoryIcons[i];
                  return (
                    <button
                      key={c}
                      className={`category ${category === c ? "selected" : ""}`}
                      onClick={() => setCategory(c)}
                      aria-pressed={category === c}
                    >
                      <Icon size={13} />
                      {cat(c)}
                    </button>
                  );
                })}
              </div>
              <div className="extra-filters">
                <SlidersHorizontal size={13} />
                <label>
                  {t("Budget", "বাজেট")}
                  <select
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                  >
                    <option value="">{t("Any price", "যেকোনো দাম")}</option>
                    <option value="100">
                      {t("Up to $100", "$100 পর্যন্ত")}
                    </option>
                    <option value="150">
                      {t("Up to $150", "$150 পর্যন্ত")}
                    </option>
                    <option value="200">
                      {t("Up to $200", "$200 পর্যন্ত")}
                    </option>
                  </select>
                </label>
                <label>
                  {t("Technology", "প্রযুক্তি")}
                  <select
                    value={technology}
                    onChange={(e) => setTechnology(e.target.value)}
                  >
                    <option value="">
                      {t("All technologies", "সব প্রযুক্তি")}
                    </option>
                    {[
                      "Next.js",
                      "React",
                      "Vue",
                      "Node.js",
                      "PostgreSQL",
                      "Supabase",
                      "MongoDB",
                    ].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                {(query ||
                  maxPrice ||
                  technology ||
                  category !== "All projects") && (
                  <button
                    className="clear-filter"
                    onClick={() => {
                      setQuery("");
                      setMaxPrice("");
                      setTechnology("");
                      setCategory("All projects");
                    }}
                  >
                    {t("Clear filters", "ফিল্টার মুছুন")} <X size={11} />
                  </button>
                )}
              </div>
              <div className="results-heading">
                <span>
                  <b>
                    {products.length} {t("projects", "টি প্রজেক্ট")}
                  </b>
                  {t("ready for your next chapter", "আপনার নতুন যাত্রার জন্য")}
                </span>
                <LayoutGrid size={14} />
              </div>
              {loadError ? (
                <div className="error-panel" role="alert">
                  <AlertCircle size={22} />
                  <h3>
                    {t("Could not load projects", "প্রজেক্ট লোড করা যায়নি")}
                  </h3>
                  <p>{loadError}</p>
                  <button className="primary" onClick={refresh}>
                    {t("Try again", "আবার চেষ্টা করুন")}
                  </button>
                </div>
              ) : loading ? (
                <div className="project-grid" aria-label="Loading projects">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div className="skeleton" key={i} />
                  ))}
                </div>
              ) : (
                <div className="project-grid">
                  {products.length ? (
                    products.map((p) => (
                      <article className="project-card" key={p.id}>
                        <button
                          className="project-visual"
                          onClick={() => open({ kind: "detail", product: p })}
                          aria-label={`${t("View", "দেখুন")} ${p.name}`}
                        >
                          <Preview p={p} lang={lang} />
                        </button>
                        <div className="card-info">
                          <div className="card-tag">
                            {cat(p.category)}
                            <span
                              className={
                                p.audit_status === "reviewed"
                                  ? "reviewed-text"
                                  : "unreviewed-text"
                              }
                            >
                              {p.audit_status === "reviewed" ? (
                                <ShieldCheck size={11} />
                              ) : (
                                <FileText size={11} />
                              )}{" "}
                              {p.audit_status === "reviewed"
                                ? t("Review recorded", "রিভিউ সংরক্ষিত")
                                : t("Not audited", "অডিট হয়নি")}
                            </span>
                          </div>
                          <button
                            className="card-title"
                            onClick={() => open({ kind: "detail", product: p })}
                          >
                            {p.name}
                            <ArrowUpRight size={15} />
                          </button>
                          <p>{p.description}</p>
                          <div className="card-stack">
                            <Code2 size={11} />
                            {p.technology.join(" · ")}
                          </div>
                          <div className="card-bottom">
                            <span>
                              <b>{money(p.price_cents)}</b>
                              <small>{t("one-time", "এককালীন")}</small>
                            </span>
                            <button
                              onClick={() =>
                                open({ kind: "detail", product: p })
                              }
                            >
                              {t("View project", "প্রজেক্ট দেখুন")}{" "}
                              <ArrowRight size={12} />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty">
                      <Search size={28} />
                      <h3>
                        {t(
                          "A little further off the beaten path.",
                          "এখানে কোনো প্রজেক্ট পাওয়া যায়নি।",
                        )}
                      </h3>
                      <p>
                        {t(
                          "Try a different keyword, category or budget.",
                          "অন্য শব্দ, ক্যাটাগরি বা বাজেট দিয়ে খুঁজুন।",
                        )}
                      </p>
                      <button
                        onClick={() => {
                          setQuery("");
                          setCategory("All projects");
                          setTechnology("");
                          setMaxPrice("");
                        }}
                      >
                        {t("Reset filters", "ফিল্টার রিসেট করুন")}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="help-banner">
                <span className="avatar vi">v</span>
                <div>
                  <h3>
                    {t(
                      "A little help finding the right fit?",
                      "সঠিক প্রজেক্ট খুঁজতে সাহায্য লাগবে?",
                    )}
                  </h3>
                  <p>
                    {t(
                      "Tell Vi what you have in mind. Find your starting point.",
                      "Vi-এর গাইড দিয়ে আপনার যাত্রা শুরু করুন।",
                    )}
                  </p>
                </div>
                <button onClick={() => open({ kind: "agent", name: "Vi" })}>
                  {t("Let’s find your project", "আপনার প্রজেক্ট খুঁজুন")}
                  <ArrowUpRight size={14} />
                </button>
              </div>
              <div className="workflow">
                <span>
                  {t(
                    "YOUR IDEA, WITH A HEAD START",
                    "আপনার আইডিয়া, এক ধাপ এগিয়ে",
                  )}
                </span>
                <div>
                  <b>{t("Discover", "খুঁজুন")}</b>
                  <i>→</i>
                  <b>{t("Make it yours", "নিজের করুন")}</b>
                  <i>→</i>
                  <b>{t("Launch", "লঞ্চ করুন")}</b>
                  <i>→</i>
                  <b>{t("Keep growing ↗", "এগিয়ে চলুন ↗")}</b>
                </div>
              </div>
            </section>
          </>
        ) : (
          <section className="dashboard">
            <div className="eyebrow">
              {t("YOUR NEXT CHAPTER", "আপনার নতুন অধ্যায়")}
            </div>
            <div className="dashboard-heading">
              <div>
                <h1>
                  {page === "admin"
                    ? t("Admin studio", "অ্যাডমিন স্টুডিও")
                    : t("My workspace", "আমার ওয়ার্কস্পেস")}
                  <span className="logo-dot">.</span>
                </h1>
                <p>
                  {t(
                    "A home for your projects, purchases and possibilities.",
                    "আপনার প্রজেক্ট, ক্রয় ও অনুরোধ এক জায়গায়।",
                  )}
                </p>
              </div>
              {user && (
                <button className="outline-button" onClick={refresh}>
                  {t("Refresh", "রিফ্রেশ")}
                </button>
              )}
            </div>
            {!user ? (
              <div className="empty">
                <ShoppingBag size={30} />
                <h3>
                  {t(
                    "Your next chapter starts here.",
                    "আপনার নতুন অধ্যায় এখানেই শুরু।",
                  )}
                </h3>
                <p>
                  {t(
                    "Sign in to see your projects and purchases.",
                    "আপনার প্রজেক্ট ও ক্রয় দেখতে সাইন ইন করুন।",
                  )}
                </p>
                <button onClick={() => open({ kind: "auth", mode: "login" })}>
                  {t("Sign in", "সাইন ইন")}
                </button>
              </div>
            ) : loadError ? (
              <div className="error-panel" role="alert">
                <p>{loadError}</p>
                <button onClick={refresh}>
                  {t("Try again", "আবার চেষ্টা করুন")}
                </button>
              </div>
            ) : loading ? (
              <div className="loading-panel">
                <LoaderCircle className="animate-spin" />
                {t("Opening your workspace…", "ওয়ার্কস্পেস লোড হচ্ছে…")}
              </div>
            ) : page === "workspace" ? (
              <>
                {stats()}
                <div className="workspace-section-title">
                  <h2>{t("Your purchases", "আপনার ক্রয়")}</h2>
                  <span className="small-label">
                    {t(
                      "Webhook-confirmed access only",
                      "শুধু যাচাইকৃত পেমেন্টে অ্যাক্সেস",
                    )}
                  </span>
                </div>
                {workspace?.orders.length ? (
                  workspace.orders.map((o) => (
                    <div className="order-box" key={o.id}>
                      <div className="dash-row">
                        <span className="avatar vi">
                          <ShoppingBag size={18} />
                        </span>
                        <div>
                          <b>{o.name}</b>
                          <small>
                            {money(o.total_cents)} ·{" "}
                            {new Date(o.created_at).toLocaleDateString(
                              lang === "bn" ? "bn-BD" : "en-US",
                            )}
                          </small>
                        </div>
                        <span
                          className={`badge ${o.status === "paid" ? "paid" : ""}`}
                        >
                          {o.status === "pending"
                            ? t("Payment pending", "পেমেন্ট বাকি")
                            : statusLabel(o.status)}
                        </span>
                        {o.status === "paid" &&
                        o.download_available &&
                        config.sourceStorage ? (
                          <a
                            className="outline-button"
                            href={`/api/downloads/${o.id}`}
                          >
                            <Download size={13} />
                            {t("Source ZIP", "সোর্স ZIP")}
                          </a>
                        ) : (
                          <span className="small-label">
                            {o.status === "paid"
                              ? t(
                                  "Download not connected",
                                  "ডাউনলোড সংযুক্ত নয়",
                                )
                              : t("Download locked", "ডাউনলোড লক করা")}
                          </span>
                        )}
                        {o.status === "paid" && (
                          <button
                            className="text-button"
                            onClick={() =>
                              open({
                                kind: "help",
                                type: "customization",
                                product: o.product_id,
                              })
                            }
                          >
                            {t("Customize", "কাস্টমাইজ")}
                          </button>
                        )}
                      </div>
                      {o.status === "paid" && (
                        <details className="license-details">
                          <summary>
                            {t("Your license terms", "আপনার লাইসেন্সের শর্ত")}
                          </summary>
                          <p>{o.license_snapshot}</p>
                        </details>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    <h3>
                      {t(
                        "Good things are waiting to be discovered.",
                        "আপনার পছন্দের প্রজেক্ট অপেক্ষায় আছে।",
                      )}
                    </h3>
                    <p>
                      {t(
                        "Your verified purchases will appear here.",
                        "আপনার নিশ্চিত ক্রয় এখানে দেখা যাবে।",
                      )}
                    </p>
                    <button onClick={() => navigate("market")}>
                      {t("Explore projects", "প্রজেক্ট দেখুন")} →
                    </button>
                  </div>
                )}
                {user.role !== "buyer" && (
                  <>
                    <div className="workspace-section-title">
                      <h2>
                        {t("Your builder projects", "আপনার বিল্ডার প্রজেক্ট")}
                      </h2>
                      <button
                        className="outline-button"
                        onClick={() => wantSubmit()}
                      >
                        <Plus size={14} />
                        {t("New project", "নতুন প্রজেক্ট")}
                      </button>
                    </div>
                    {workspace?.products.length ? (
                      workspace.products.map((p) => (
                        <div className="builder-row" key={p.id}>
                          <div className="dash-row">
                            <span className={`avatar ${p.accent}`}>
                              <Code2 size={18} />
                            </span>
                            <div>
                              <b>{p.name}</b>
                              <small>
                                {cat(p.category)} · {money(p.price_cents)}
                              </small>
                            </div>
                            <span className={`badge ${p.status}`}>
                              {statusLabel(p.status)}
                            </span>
                            <button
                              className="text-button"
                              onClick={() => wantSubmit(p)}
                            >
                              {t("Edit", "সম্পাদনা")}
                            </button>
                            <button
                              className="outline-button"
                              onClick={() =>
                                open({ kind: "artifact", product: p })
                              }
                            >
                              <Upload size={13} />
                              {p.download_available
                                ? t("Replace ZIP", "ZIP বদলান")
                                : t("Attach source", "সোর্স যোগ করুন")}
                            </button>
                          </div>
                          {p.review_note && (
                            <p className="review-note">
                              <b>{t("Review note:", "রিভিউ নোট:")}</b>{" "}
                              {p.review_note}
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="empty">
                        <h3>
                          {t(
                            "Made something worth sharing?",
                            "শেয়ার করার মতো কিছু বানিয়েছেন?",
                          )}
                        </h3>
                        <p>
                          {t(
                            "Submit your software and attach its source for review.",
                            "আপনার সফটওয়্যার ও সোর্স রিভিউয়ের জন্য জমা দিন।",
                          )}
                        </p>
                        <button onClick={() => wantSubmit()}>
                          {t("Submit a project", "প্রজেক্ট জমা দিন")} →
                        </button>
                      </div>
                    )}
                  </>
                )}
                <div className="workspace-section-title">
                  <h2>{t("Your requests", "আপনার অনুরোধ")}</h2>
                  <button
                    className="outline-button"
                    onClick={() => open({ kind: "help" })}
                  >
                    {t("Ask for help", "সাহায্য চান")}
                  </button>
                </div>
                {workspace?.requests.length ? (
                  workspace.requests.map((r) => (
                    <RequestRow
                      key={r.id}
                      r={r}
                      lang={lang}
                      status={statusLabel(r.status)}
                    />
                  ))
                ) : (
                  <div className="empty">
                    <h3>
                      {t(
                        "A little expertise goes a long way.",
                        "সঠিক সাহায্য আপনাকে এগিয়ে নেবে।",
                      )}
                    </h3>
                    <p>
                      {t(
                        "Development, design or infrastructure — tell us what you need.",
                        "ডেভেলপমেন্ট, ডিজাইন বা সার্ভার—কী দরকার জানান।",
                      )}
                    </p>
                    <button onClick={() => open({ kind: "help" })}>
                      {t("Create a request", "অনুরোধ তৈরি করুন")}
                    </button>
                  </div>
                )}
              </>
            ) : admin ? (
              <>
                <div className="notice">
                  {t(
                    "Record real review findings. Approval is not a security certification. Account actions and reviews are logged.",
                    "প্রকৃত রিভিউয়ের ফল লিখুন। অনুমোদন নিরাপত্তার সনদ নয়। সব অ্যাডমিন কাজ সংরক্ষিত হয়।",
                  )}
                </div>
                <div className="admin-tabs">
                  {["projects", "users", "requests", "activity"].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setAdminTab(tab)}
                      className={adminTab === tab ? "selected" : ""}
                    >
                      {
                        {
                          projects: t("Project reviews", "প্রজেক্ট রিভিউ"),
                          users: t("User accounts", "ইউজার অ্যাকাউন্ট"),
                          requests: t("Help requests", "সাহায্যের অনুরোধ"),
                          activity: t("Activity log", "কার্যক্রম"),
                        }[tab]
                      }
                    </button>
                  ))}
                </div>
                {adminTab === "projects" ? (
                  admin.products.map((p) => (
                    <div className="dash-row" key={p.id}>
                      <span className={`avatar ${p.accent}`}>
                        <Code2 size={17} />
                      </span>
                      <div>
                        <b>
                          {p.name}
                          {p.sample && (
                            <span className="small-label"> · Sample</span>
                          )}
                        </b>
                        <small>
                          {p.seller_name} ·{" "}
                          {p.download_available
                            ? "Source attached"
                            : "No source attached"}
                        </small>
                      </div>
                      <span className={`badge ${p.status}`}>
                        {statusLabel(p.status)}
                      </span>
                      <button
                        className="text-button"
                        onClick={() => open({ kind: "detail", product: p })}
                      >
                        {t("Details", "বিস্তারিত")}
                      </button>
                      <button
                        className="outline-button"
                        onClick={() => open({ kind: "review", product: p })}
                      >
                        {t("Review", "রিভিউ")} <ArrowUpRight size={13} />
                      </button>
                    </div>
                  ))
                ) : adminTab === "users" ? (
                  admin.users.map((u) => (
                    <div className="dash-row" key={u.id}>
                      <span className="profile-icon">{u.name[0]}</span>
                      <div>
                        <b>{u.name}</b>
                        <small>
                          {u.email} · {u.role}
                        </small>
                      </div>
                      <span className="badge">
                        {u.disabled
                          ? t("Disabled", "নিষ্ক্রিয়")
                          : t("Active", "সক্রিয়")}
                      </span>
                      {u.role !== "admin" && (
                        <button
                          className="outline-button"
                          onClick={async () => {
                            try {
                              await send(
                                "/api/admin/users/" + u.id,
                                { disabled: !u.disabled },
                                "PATCH",
                              );
                              refresh();
                              toast(
                                t(
                                  "Account updated.",
                                  "অ্যাকাউন্ট আপডেট হয়েছে।",
                                ),
                              );
                            } catch (e) {
                              toast((e as Error).message);
                            }
                          }}
                        >
                          {u.disabled
                            ? t("Enable", "সক্রিয় করুন")
                            : t("Disable", "নিষ্ক্রিয় করুন")}
                        </button>
                      )}
                    </div>
                  ))
                ) : adminTab === "requests" ? (
                  admin.requests.length ? (
                    admin.requests.map((r) => (
                      <div className="admin-request" key={r.id}>
                        <RequestRow
                          r={r}
                          lang={lang}
                          status={statusLabel(r.status)}
                        />
                        <form
                          className="admin-request-form"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            try {
                              await send(
                                "/api/admin/requests/" + r.id,
                                {
                                  status: f.get("status"),
                                  admin_note: f.get("admin_note"),
                                },
                                "PATCH",
                              );
                              refresh();
                              toast(
                                t("Request updated.", "অনুরোধ আপডেট হয়েছে।"),
                              );
                            } catch (e) {
                              toast((e as Error).message);
                            }
                          }}
                        >
                          <select
                            name="status"
                            defaultValue={r.status}
                            aria-label="Request status"
                          >
                            {[
                              "submitted",
                              "in_review",
                              "completed",
                              "closed",
                            ].map((s) => (
                              <option key={s} value={s}>
                                {statusLabel(s)}
                              </option>
                            ))}
                          </select>
                          <input
                            required
                            minLength={5}
                            maxLength={2000}
                            name="admin_note"
                            defaultValue={r.admin_note}
                            aria-label="Request note"
                            placeholder={t(
                              "Add an honest progress note",
                              "প্রকৃত অগ্রগতির নোট লিখুন",
                            )}
                          />
                          <button className="outline-button">
                            {t("Update", "আপডেট")}
                          </button>
                        </form>
                      </div>
                    ))
                  ) : (
                    <div className="empty">
                      {t("No requests yet.", "এখনো কোনো অনুরোধ নেই।")}
                    </div>
                  )
                ) : admin.actions.length ? (
                  admin.actions.map((a) => (
                    <div className="activity-row" key={a.id}>
                      <span>
                        <ShieldCheck size={16} />
                      </span>
                      <div>
                        <b>
                          {a.admin_name} · {a.action.replaceAll("_", " ")}
                        </b>
                        <small>{new Date(a.created_at).toLocaleString()}</small>
                        <pre>{a.details}</pre>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    {t(
                      "Admin activity will appear here.",
                      "অ্যাডমিন কার্যক্রম এখানে দেখা যাবে।",
                    )}
                  </div>
                )}
              </>
            ) : null}
          </section>
        )}
        <footer>
          <span>
            © {new Date().getFullYear()} Vibe96.{" "}
            {t(
              "Built for your next big thing.",
              "আপনার পরের বড় আইডিয়ার জন্য।",
            )}
          </span>
          <span>
            {t("Sample listings clearly marked", "নমুনা প্রজেক্ট চিহ্নিত আছে")}{" "}
            <span className="footer-star">✦</span>
          </span>
        </footer>
      </main>
      {dialog && (
        <Modal
          label={
            dialog.kind === "detail"
              ? dialog.product.name
              : dialog.kind === "seller"
                ? dialog.name
                : t("Vibe96 " + dialog.kind, "Vibe96 ডায়ালগ")
          }
          closeLabel={t("Close dialog", "ডায়ালগ বন্ধ করুন")}
          onClose={() => {
            if (!busy) setDialog(null);
          }}
        >
          {dialog.kind === "auth" ? (
            <>
              <div className="eyebrow">
                {t(
                  "YOUR NEXT CHAPTER STARTS HERE",
                  "আপনার নতুন অধ্যায় এখান থেকেই",
                )}
              </div>
              <h2>
                {dialog.mode === "login"
                  ? t("Welcome back.", "আবার স্বাগতম।")
                  : t("Make room for possibility.", "সম্ভাবনার দরজা খুলুন।")}
              </h2>
              <p>
                {t(
                  "A home for builders and the businesses they empower.",
                  "বিল্ডার ও ব্যবসায়ীদের এক ঠিকানা।",
                )}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  perform(async () => {
                    const b =
                      dialog.mode === "login"
                        ? { email: f.get("email"), password: f.get("password") }
                        : {
                            email: f.get("email"),
                            password: f.get("password"),
                            name: f.get("name"),
                            role: f.get("role"),
                          };
                    const a = await send<{ user: User }>(
                      "/api/auth/" +
                        (dialog.mode === "login" ? "login" : "register"),
                      b,
                    );
                    setUser(a.user);
                    setDialog(
                      dialog.intent === "sell" && a.user.role !== "buyer"
                        ? { kind: "submit" }
                        : null,
                    );
                    navigate("workspace");
                    refresh();
                    toast(
                      t(
                        "You’re in. Welcome to your next chapter.",
                        "স্বাগতম! আপনার অ্যাকাউন্ট প্রস্তুত।",
                      ),
                    );
                  });
                }}
              >
                {dialog.mode === "register" && (
                  <label>
                    {t("Your name", "আপনার নাম")}
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={80}
                      autoComplete="name"
                      placeholder="Alex Morgan"
                    />
                  </label>
                )}
                <label>
                  {t("Email address", "ইমেইল")}
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                  />
                </label>
                <label>
                  {t("Password", "পাসওয়ার্ড")}
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={dialog.mode === "register" ? 12 : 1}
                    maxLength={128}
                    autoComplete={
                      dialog.mode === "login"
                        ? "current-password"
                        : "new-password"
                    }
                    placeholder={
                      dialog.mode === "register"
                        ? t("At least 12 characters", "অন্তত ১২ অক্ষর")
                        : "••••••••••••"
                    }
                  />
                </label>
                {dialog.mode === "register" && (
                  <label>
                    {t("I’m here to", "আমি চাই")}
                    <select
                      name="role"
                      defaultValue={
                        dialog.intent === "sell" ? "builder" : "buyer"
                      }
                    >
                      <option value="buyer">
                        {t(
                          "Discover & buy software",
                          "সফটওয়্যার খুঁজতে ও কিনতে",
                        )}
                      </option>
                      <option value="builder">
                        {t(
                          "Build & sell software",
                          "সফটওয়্যার তৈরি ও বিক্রি করতে",
                        )}
                      </option>
                    </select>
                  </label>
                )}
                {formError}
                {submitButton(
                  dialog.mode === "login"
                    ? t("Sign in", "সাইন ইন")
                    : t("Create account", "অ্যাকাউন্ট তৈরি করুন"),
                )}
              </form>
              <div className="auth-switch">
                {dialog.mode === "login"
                  ? t("New around here?", "নতুন এসেছেন?")
                  : t("Already have an account?", "আগেই অ্যাকাউন্ট আছে?")}{" "}
                <button
                  className="text-button"
                  onClick={() =>
                    open({
                      kind: "auth",
                      mode: dialog.mode === "login" ? "register" : "login",
                      intent: dialog.intent,
                    })
                  }
                >
                  {dialog.mode === "login"
                    ? t("Create an account", "অ্যাকাউন্ট তৈরি করুন")
                    : t("Sign in", "সাইন ইন")}
                </button>
              </div>
              <p className="auth-footnote">
                {t(
                  "Local seed accounts are documented in README. Never enter sensitive patient or financial data into sample projects.",
                  "স্থানীয় ডেমো অ্যাকাউন্টের তথ্য README-তে আছে। নমুনা প্রজেক্টে রোগীর বা আর্থিক সংবেদনশীল তথ্য দেবেন না।",
                )}
              </p>
            </>
          ) : dialog.kind === "seller" ? (
            <SellerProfile
              id={dialog.id}
              lang={lang}
              onProject={(p) => open({ kind: "detail", product: p })}
            />
          ) : dialog.kind === "detail" ? (
            <>
              <Preview p={dialog.product} large lang={lang} />
              <div className="eyebrow detail-category">
                {cat(dialog.product.category)}{" "}
                {dialog.product.sample &&
                  " · " + t("SAMPLE LISTING", "নমুনা প্রজেক্ট")}
              </div>
              <h2>{dialog.product.name}</h2>
              <p>{dialog.product.description}</p>
              <div className="seller-line">
                <span className="profile-icon">
                  {dialog.product.seller_name[0]}
                </span>
                <span>
                  {t("Built by", "বিল্ডার")}{" "}
                  <button
                    className="seller-profile-link"
                    onClick={() =>
                      open({
                        kind: "seller",
                        id: dialog.product.seller_id,
                        name: dialog.product.seller_name,
                      })
                    }
                  >
                    {dialog.product.seller_name}
                  </button>
                </span>
                <a
                  href={dialog.product.repository}
                  target="_blank"
                  rel="noreferrer"
                  className="text-button"
                >
                  GitHub <ExternalLink size={12} />
                </a>
              </div>
              <div className="tech-tags">
                {dialog.product.technology.map((tech) => (
                  <span key={tech}>{tech}</span>
                ))}
              </div>
              {dialog.product.screenshots.length > 0 && (
                <div className="screenshots">
                  {dialog.product.screenshots.map((src, i) => (
                    <a key={i} href={src} target="_blank" rel="noreferrer">
                      <img
                        src={src}
                        alt={`${dialog.product.name} screenshot ${i + 1}`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </a>
                  ))}
                </div>
              )}
              <h3>
                {t(
                  "Everything you need to get started",
                  "শুরু করার প্রয়োজনীয় সবকিছু",
                )}
              </h3>
              <ul className="feature-list">
                {dialog.product.features.map((f) => (
                  <li key={f}>
                    <Check size={14} />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="notice">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} />
                  <b>
                    {dialog.product.audit_status === "reviewed"
                      ? t("Human review recorded", "হিউম্যান রিভিউ সংরক্ষিত")
                      : t("Not independently audited", "স্বাধীন অডিট হয়নি")}
                  </b>
                </div>
                <p>
                  {dialog.product.audit_status === "reviewed"
                    ? dialog.product.audit_findings
                    : t(
                        "No independent security audit has been recorded. Listing approval is not a guarantee of security or regulatory compliance.",
                        "স্বাধীন নিরাপত্তা অডিট সংরক্ষিত নেই। তালিকার অনুমোদন নিরাপত্তা বা আইনি সম্মতির নিশ্চয়তা নয়।",
                      )}
                </p>
                {dialog.product.reviewed_at && (
                  <small>
                    {new Date(dialog.product.reviewed_at).toLocaleDateString()}
                  </small>
                )}
              </div>
              <details className="license-details">
                <summary>
                  {t("License & ownership", "লাইসেন্স ও মালিকানা")}
                </summary>
                <p>{dialog.product.license}</p>
              </details>
              <div className="checkout-row">
                <b>
                  {money(dialog.product.price_cents)}{" "}
                  <small>{t("one-time", "এককালীন")}</small>
                </b>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !config.payments ||
                    !config.sourceStorage ||
                    !dialog.product.download_available ||
                    (!!user && user.role !== "buyer")
                  }
                  onClick={() => buy(dialog.product)}
                >
                  {busy ? (
                    <LoaderCircle className="animate-spin" size={16} />
                  ) : null}
                  {t("Buy with Stripe test", "Stripe টেস্টে কিনুন")}{" "}
                  <ArrowRight size={14} />
                </button>
              </div>
              <div className="connection-state">
                <span
                  className={config.payments ? "connected-dot" : "offline-dot"}
                />
                {config.payments
                  ? t(
                      "Stripe test keys configured",
                      "Stripe টেস্ট key সেট করা আছে",
                    )
                  : t("Payments: Not connected", "পেমেন্ট: সংযুক্ত নয়")}
                <br />
                <span
                  className={
                    dialog.product.download_available && config.sourceStorage
                      ? "connected-dot"
                      : "offline-dot"
                  }
                />
                {dialog.product.download_available && config.sourceStorage
                  ? t(
                      "Source archive attached. Unlocked after verified payment.",
                      "সোর্স সংযুক্ত। যাচাইকৃত পেমেন্টের পর খুলবে।",
                    )
                  : t(
                      "Source download: Not connected",
                      "সোর্স ডাউনলোড: সংযুক্ত নয়",
                    )}
              </div>
              {user && user.role !== "buyer" && (
                <p className="muted">
                  {t(
                    "Purchases require a buyer account.",
                    "কেনার জন্য বায়ার অ্যাকাউন্ট প্রয়োজন।",
                  )}
                </p>
              )}
              {formError}
            </>
          ) : dialog.kind === "submit" ? (
            <>
              <div className="eyebrow">
                {t("BUILD → REVIEW → LAUNCH", "তৈরি → রিভিউ → প্রকাশ")}
              </div>
              <h2>
                {dialog.product
                  ? t(
                      "A new chapter for your project.",
                      "আপনার প্রজেক্টের নতুন অধ্যায়।",
                    )
                  : t("Built something good?", "দারুণ কিছু বানিয়েছেন?")}
              </h2>
              <p>
                {t(
                  "Give it a home. Every submission and edit goes through review before it is published. Attach a source ZIP separately after saving.",
                  "প্রতিটি নতুন প্রজেক্ট ও পরিবর্তন প্রকাশের আগে রিভিউ হবে। সংরক্ষণের পর আলাদাভাবে সোর্স ZIP যোগ করুন।",
                )}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  perform(async () => {
                    const lines = (name: string) =>
                      String(f.get(name) || "")
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean);
                    const body = {
                      name: f.get("name"),
                      description: f.get("description"),
                      category: f.get("category"),
                      price_cents: Math.round(Number(f.get("price")) * 100),
                      repository: f.get("repository"),
                      license: f.get("license"),
                      technology: String(f.get("technology"))
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                      features: lines("features"),
                      screenshots: lines("screenshots"),
                    };
                    await send(
                      dialog.product
                        ? "/api/products/" + dialog.product.id
                        : "/api/products",
                      body,
                      dialog.product ? "PATCH" : "POST",
                    );
                    setDialog(null);
                    navigate("workspace");
                    refresh();
                    toast(
                      t(
                        "Project saved and queued for review. Attach your source archive next.",
                        "প্রজেক্ট সংরক্ষিত ও রিভিউয়ের অপেক্ষায়। এবার সোর্স যোগ করুন।",
                      ),
                    );
                  });
                }}
              >
                <label>
                  {t("Project name", "প্রজেক্টের নাম")}
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={100}
                    defaultValue={dialog.product?.name}
                    placeholder="Your next big thing"
                  />
                </label>
                <div className="form-row">
                  <label>
                    {t("Category", "ক্যাটাগরি")}
                    <select
                      name="category"
                      defaultValue={dialog.product?.category || "Healthcare"}
                    >
                      {categoryNames.slice(1).map((c) => (
                        <option key={c} value={c}>
                          {cat(c)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("One-time price (USD)", "এককালীন দাম (USD)")}
                    <input
                      name="price"
                      type="number"
                      required
                      min="1"
                      max="100000"
                      step="0.01"
                      defaultValue={
                        dialog.product ? dialog.product.price_cents / 100 : 149
                      }
                    />
                  </label>
                </div>
                <label>
                  {t("GitHub repository", "GitHub রিপোজিটরি")}
                  <input
                    name="repository"
                    type="url"
                    required
                    defaultValue={dialog.product?.repository}
                    placeholder="https://github.com/you/project"
                  />
                </label>
                <label>
                  {t("Description", "বিবরণ")}
                  <textarea
                    name="description"
                    required
                    minLength={20}
                    maxLength={4000}
                    rows={3}
                    defaultValue={dialog.product?.description}
                    placeholder={t(
                      "Who is it for, and what problem does it solve?",
                      "কার জন্য এবং কী সমস্যার সমাধান করে?",
                    )}
                  />
                </label>
                <label>
                  {t(
                    "Technology (comma-separated)",
                    "প্রযুক্তি (কমা দিয়ে আলাদা করুন)",
                  )}
                  <input
                    name="technology"
                    required
                    defaultValue={dialog.product?.technology.join(", ")}
                    placeholder="Next.js, PostgreSQL"
                  />
                </label>
                <label>
                  {t("Features (one per line)", "ফিচার (প্রতি লাইনে একটি)")}
                  <textarea
                    name="features"
                    required
                    rows={3}
                    defaultValue={dialog.product?.features.join("\n")}
                    placeholder="Patient records&#10;Appointment scheduling"
                  />
                </label>
                <label>
                  {t(
                    "Screenshot URLs (HTTPS, one per line, optional)",
                    "স্ক্রিনশট URL (HTTPS, প্রতি লাইনে একটি, ঐচ্ছিক)",
                  )}
                  <textarea
                    name="screenshots"
                    rows={2}
                    defaultValue={dialog.product?.screenshots.join("\n")}
                    placeholder="https://example.com/screenshot.png"
                  />
                </label>
                <label>
                  {t("License terms", "লাইসেন্সের শর্ত")}
                  <textarea
                    name="license"
                    required
                    minLength={20}
                    maxLength={4000}
                    rows={3}
                    defaultValue={
                      dialog.product?.license ||
                      "One business installation. Builder retains copyright. Source redistribution and resale are prohibited. Updates and customization are not included."
                    }
                  />
                </label>
                {formError}
                {submitButton(
                  t("Save & submit for review", "সংরক্ষণ ও রিভিউয়ে জমা দিন"),
                )}
              </form>
            </>
          ) : dialog.kind === "artifact" ? (
            <>
              <div className="eyebrow">
                {t("PRIVATE SOURCE DELIVERY", "ব্যক্তিগত সোর্স ডেলিভারি")}
              </div>
              <h2>{t("Attach your source.", "আপনার সোর্স যোগ করুন।")}</h2>
              <p>
                {dialog.product.name} ·{" "}
                {t(
                  `ZIP archive, up to ${config.maxUploadBytes / 1024 / 1024} MiB. Never include .env files, tokens, private customer records or other secrets.`,
                  `সর্বোচ্চ ${config.maxUploadBytes / 1024 / 1024} MiB ZIP। .env, টোকেন, গ্রাহকের তথ্য বা গোপন তথ্য দেবেন না।`,
                )}
              </p>
              <div className="notice">
                {t(
                  "Buyer downloads require a confirmed purchase. Owners and admins can inspect the submitted archive. Replacing source resets approval and audit status.",
                  "বায়ারের ডাউনলোডের জন্য নিশ্চিত পেমেন্ট প্রয়োজন। মালিক ও অ্যাডমিন জমা দেওয়া সোর্স দেখতে পারেন। সোর্স বদলালে নতুন রিভিউ প্রয়োজন।",
                )}
              </div>
              {!config.sourceStorage && (
                <div className="notice" role="status">
                  {t(
                    "Private source storage: Not connected. Connect a private Vercel Blob store to enable uploads and downloads.",
                    "ব্যক্তিগত সোর্স স্টোরেজ: সংযুক্ত নয়। আপলোড ও ডাউনলোড চালু করতে private Vercel Blob সংযোগ দিন।",
                  )}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  perform(async () => {
                    await api(
                      "/api/products/" + dialog.product.id + "/artifact",
                      { method: "POST", body: form },
                    );
                    setDialog(null);
                    refresh();
                    toast(
                      t(
                        "Source attached. Project returned to review.",
                        "সোর্স সংযুক্ত। প্রজেক্ট আবার রিভিউয়ে পাঠানো হয়েছে।",
                      ),
                    );
                  });
                }}
              >
                <label className="file-upload">
                  <Upload size={24} />
                  {t("Choose source ZIP", "সোর্স ZIP বেছে নিন")}
                  <input
                    name="archive"
                    disabled={!config.sourceStorage}
                    type="file"
                    accept=".zip,application/zip"
                    required
                  />
                </label>
                {formError}
                {submitButton(
                  t("Upload archive", "আর্কাইভ আপলোড করুন"),
                  !config.sourceStorage,
                )}
              </form>
            </>
          ) : dialog.kind === "review" ? (
            <>
              <div className="eyebrow">
                {t("ADMIN REVIEW", "অ্যাডমিন রিভিউ")}
              </div>
              <h2>{dialog.product.name}</h2>
              <p>
                {t(
                  "Publish only what you have actually reviewed. Record specific findings; never imply a security certification.",
                  "যা যাচাই করেছেন তার প্রকৃত ফল লিখুন। নিরাপত্তার সনদ হিসেবে দাবি করবেন না।",
                )}
              </p>
              <div className="notice">
                {dialog.product.download_available && config.sourceStorage
                  ? t(
                      "Source archive attached. Review the repository before approval.",
                      "সোর্স সংযুক্ত আছে। অনুমোদনের আগে রিপোজিটরি যাচাই করুন।",
                    )
                  : t(
                      "No archive attached. Approval will not enable checkout until source is attached and reviewed again.",
                      "সোর্স সংযুক্ত নেই। সোর্স যোগ ও আবার রিভিউ না হওয়া পর্যন্ত কেনা যাবে না।",
                    )}
                <a
                  className="repo-link"
                  href={dialog.product.repository}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("Open repository", "রিপোজিটরি খুলুন")}{" "}
                  <ExternalLink size={12} />
                </a>
              </div>
              {dialog.product.download_available && (
                <a
                  className="outline-button review-download"
                  href={`/api/products/${dialog.product.id}/artifact?revision=${dialog.product.revision}`}
                >
                  <Download size={14} />
                  {t(
                    "Inspect submitted source ZIP",
                    "জমা দেওয়া সোর্স ZIP দেখুন",
                  )}
                </a>
              )}
              <p className="small-label">
                {t("Reviewing revision", "রিভিউ সংস্করণ")}{" "}
                {dialog.product.revision}.{" "}
                {t(
                  "If this project changes, close this dialog and refresh before reviewing again.",
                  "প্রজেক্ট পরিবর্তিত হলে ডায়ালগ বন্ধ করে রিফ্রেশ করুন।",
                )}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  perform(async () => {
                    await send("/api/admin/reviews/" + dialog.product.id, {
                      status: f.get("status"),
                      review_note: f.get("review_note"),
                      audit_status: f.get("audit_status"),
                      audit_findings: f.get("audit_findings"),
                      expected_revision: dialog.product.revision,
                    });
                    setDialog(null);
                    refresh();
                    toast(t("Review recorded.", "রিভিউ সংরক্ষিত হয়েছে।"));
                  });
                }}
              >
                <div className="form-row">
                  <label>
                    {t("Listing decision", "তালিকার সিদ্ধান্ত")}
                    <select
                      name="status"
                      defaultValue={
                        dialog.product.status === "rejected"
                          ? "rejected"
                          : "approved"
                      }
                    >
                      <option value="approved">
                        {t("Approve listing", "তালিকা অনুমোদন")}
                      </option>
                      <option value="rejected">
                        {t("Request changes", "পরিবর্তন চাই")}
                      </option>
                    </select>
                  </label>
                  <label>
                    {t("Audit status", "অডিটের অবস্থা")}
                    <select
                      name="audit_status"
                      defaultValue={dialog.product.audit_status}
                    >
                      <option value="not_reviewed">
                        {t("Not independently audited", "স্বাধীন অডিট হয়নি")}
                      </option>
                      <option value="reviewed">
                        {t("Human review recorded", "হিউম্যান রিভিউ সংরক্ষিত")}
                      </option>
                    </select>
                  </label>
                </div>
                <label>
                  {t("Listing review note", "তালিকার রিভিউ নোট")}
                  <textarea
                    name="review_note"
                    required
                    minLength={10}
                    maxLength={3000}
                    rows={3}
                    defaultValue={dialog.product.review_note}
                  />
                </label>
                <label>
                  {t(
                    "Specific findings, scope & limitations",
                    "নির্দিষ্ট ফলাফল, পরিধি ও সীমাবদ্ধতা",
                  )}
                  <textarea
                    name="audit_findings"
                    maxLength={5000}
                    rows={5}
                    defaultValue={dialog.product.audit_findings}
                    placeholder={t(
                      "What was checked? What remains unverified? At least 30 characters if a review is recorded.",
                      "কী যাচাই করা হয়েছে? কী যাচাই হয়নি? রিভিউ চিহ্নিত করলে অন্তত ৩০ অক্ষর লিখুন।",
                    )}
                  />
                </label>
                {formError}
                {submitButton(t("Record review", "রিভিউ সংরক্ষণ"))}
              </form>
            </>
          ) : dialog.kind === "help" ? (
            <>
              <div className="eyebrow">
                {t("A LITTLE HUMAN EXPERTISE", "সঠিক বিশেষজ্ঞের সাহায্য")}
              </div>
              <h2>
                {t("Big ideas. Expert hands.", "বড় আইডিয়া। দক্ষ হাতে।")}
              </h2>
              <p>
                {t(
                  "Tell us what you need. Your request will be saved for admin review; no expert is automatically booked.",
                  "আপনার প্রয়োজন জানান। অনুরোধ অ্যাডমিন রিভিউয়ে যাবে; স্বয়ংক্রিয়ভাবে কাউকে নিয়োগ দেওয়া হবে না।",
                )}
              </p>
              <div className="notice">
                {t(
                  "Expert booking & automated deployment: Not connected. Requests are tracked in your workspace.",
                  "বিশেষজ্ঞ বুকিং ও স্বয়ংক্রিয় ডেপ্লয়মেন্ট: সংযুক্ত নয়। ওয়ার্কস্পেসে অনুরোধের অবস্থা দেখুন।",
                )}
              </div>
              {!user ? (
                <button
                  className="primary"
                  onClick={() => open({ kind: "auth", mode: "login" })}
                >
                  {t("Sign in to create a request", "অনুরোধ করতে সাইন ইন করুন")}
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    perform(async () => {
                      await send("/api/requests", {
                        kind: f.get("kind"),
                        description: f.get("description"),
                        product_id: dialog.product || null,
                      });
                      setDialog(null);
                      navigate("workspace");
                      refresh();
                      toast(
                        t(
                          "Request submitted. No expert has been booked yet.",
                          "অনুরোধ জমা হয়েছে। এখনো কোনো বিশেষজ্ঞ বুক হয়নি।",
                        ),
                      );
                    });
                  }}
                >
                  <label>
                    {t("I need help with", "আমার সাহায্য দরকার")}
                    <select
                      name="kind"
                      defaultValue={dialog.type || "development"}
                    >
                      {[
                        [
                          "development",
                          t(
                            "Development & integrations",
                            "ডেভেলপমেন্ট ও ইন্টিগ্রেশন",
                          ),
                        ],
                        [
                          "design",
                          t(
                            "Product & interface design",
                            "প্রোডাক্ট ও ইন্টারফেস ডিজাইন",
                          ),
                        ],
                        [
                          "infrastructure",
                          t(
                            "Servers, backups & monitoring",
                            "সার্ভার, ব্যাকআপ ও মনিটরিং",
                          ),
                        ],
                        [
                          "customization",
                          t(
                            "Customize my purchased project",
                            "কেনা প্রজেক্ট কাস্টমাইজ",
                          ),
                        ],
                        [
                          "deployment",
                          t("Deployment planning", "ডেপ্লয়মেন্ট পরিকল্পনা"),
                        ],
                      ].map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("Describe your goal", "আপনার লক্ষ্য লিখুন")}
                    <textarea
                      name="description"
                      required
                      minLength={20}
                      maxLength={4000}
                      rows={5}
                      placeholder={t(
                        "What should change? What does success look like? Include constraints, but never passwords or API keys.",
                        "কী পরিবর্তন চান? কী সীমাবদ্ধতা আছে? পাসওয়ার্ড বা API key দেবেন না।",
                      )}
                    />
                  </label>
                  {formError}
                  {submitButton(t("Submit request", "অনুরোধ জমা দিন"))}
                </form>
              )}
            </>
          ) : dialog.kind === "agent" ? (
            <>
              <span className={`avatar ${dialog.name.toLowerCase()}`}>
                {dialog.name[0].toLowerCase()}
              </span>
              <div className="eyebrow agent-eyebrow">
                {t("MEET", "পরিচয়")} {dialog.name.toUpperCase()}
              </div>
              <h2>
                {
                  {
                    Vi: t("Find your fit.", "সঠিক প্রজেক্ট খুঁজুন।"),
                    Remi: t(
                      "Build. Share. Grow.",
                      "তৈরি করুন। শেয়ার করুন। এগিয়ে যান।",
                    ),
                    Axel: t(
                      "A clear path to going live.",
                      "ডেপ্লয়মেন্টের পরিষ্কার পরিকল্পনা।",
                    ),
                    Nova: t("Make it your own.", "নিজের মতো করে নিন।"),
                  }[dialog.name]
                }
              </h2>
              <p>
                {
                  {
                    Vi: t(
                      "Choose what you’re building. I’ll show you the matching projects.",
                      "কী তৈরি করতে চান বেছে নিন। মিল থাকা প্রজেক্ট দেখাব।",
                    ),
                    Remi: t(
                      "Add your repository, features, license and price. Attach a source archive, then follow your review in the builder dashboard.",
                      "রিপোজিটরি, ফিচার, লাইসেন্স ও দাম লিখুন। সোর্স যোগ করুন। ড্যাশবোর্ডে রিভিউ দেখুন।",
                    ),
                    Axel: t(
                      "Going live needs hosting, a domain, a configured database, backups and monitoring. Request a deployment plan without handing over credentials.",
                      "লাইভ করতে হোস্টিং, ডোমেইন, ডেটাবেস, ব্যাকআপ ও মনিটরিং দরকার। গোপন তথ্য না দিয়েই পরিকল্পনার অনুরোধ করুন।",
                    ),
                    Nova: t(
                      "Start with your goal, the current behavior, and the change you want. A clear brief helps an expert give you a useful plan.",
                      "লক্ষ্য, বর্তমান আচরণ ও কাঙ্ক্ষিত পরিবর্তন লিখুন। পরিষ্কার বিবরণ বিশেষজ্ঞকে পরিকল্পনা করতে সাহায্য করে।",
                    ),
                  }[dialog.name]
                }
              </p>
              <div className="notice">
                {t(
                  "Live AI: Not connected. This panel provides guided actions; it does not run AI, edit code or change infrastructure.",
                  "লাইভ AI: সংযুক্ত নয়। এটি গাইড; AI চালায় না, কোড বা সার্ভার পরিবর্তন করে না।",
                )}
              </div>
              {dialog.name === "Vi" ? (
                <div className="agent-choices">
                  {categoryNames.slice(1).map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        setCategory(c);
                        setQuery("");
                        setTechnology("");
                        setMaxPrice("");
                        navigate("market");
                        setDialog(null);
                      }}
                    >
                      {cat(c)}
                      <ArrowRight size={13} />
                    </button>
                  ))}
                </div>
              ) : dialog.name === "Remi" ? (
                <button className="primary" onClick={() => wantSubmit()}>
                  {t("Submit your project", "প্রজেক্ট জমা দিন")}{" "}
                  <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  className="primary"
                  onClick={() =>
                    open({
                      kind: "help",
                      type:
                        dialog.name === "Axel" ? "deployment" : "customization",
                    })
                  }
                >
                  {t("Draft a request", "অনুরোধ লিখুন")}{" "}
                  <ArrowRight size={14} />
                </button>
              )}
            </>
          ) : null}
        </Modal>
      )}
      {message && (
        <div id="toast" className="show" role="status">
          <CheckCircle2 size={16} />
          {message}
        </div>
      )}
    </>
  );
}
function RequestRow({
  r,
  status,
  lang,
}: {
  r: HelpRequest;
  status: string;
  lang: "en" | "bn";
}) {
  return (
    <div className="request-row">
      <div className="request-row-top">
        <div>
          <b>
            {lang === "bn"
              ? {
                  development: "ডেভেলপমেন্ট",
                  design: "ডিজাইন",
                  infrastructure: "সার্ভার ও অবকাঠামো",
                  customization: "কাস্টমাইজেশন",
                  deployment: "ডেপ্লয়মেন্ট",
                }[r.kind] || r.kind
              : r.kind[0].toUpperCase() + r.kind.slice(1)}
          </b>
          <small>
            {r.user_name ||
              r.product_name ||
              new Date(r.created_at).toLocaleDateString()}
          </small>
        </div>
        <span className="badge">{status}</span>
      </div>
      <p>{r.description}</p>
      {r.admin_note && (
        <div className="request-note">
          <b>{lang === "bn" ? "টিমের আপডেট" : "Team update"}</b>
          <p>{r.admin_note}</p>
        </div>
      )}
    </div>
  );
}

function SellerProfile({
  id,
  lang,
  onProject,
}: {
  id: string;
  lang: "en" | "bn";
  onProject: (p: Product) => void;
}) {
  const [data, setData] = useState<{
    seller: { id: string; name: string; created_at: string };
    products: Product[];
  } | null>(null);
  const [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const t = (en: string, bn: string) => (lang === "en" ? en : bn);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setData(null);
    api<{
      seller: { id: string; name: string; created_at: string };
      products: Product[];
    }>("/api/sellers/" + id, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [id, retry]);
  if (error)
    return (
      <div role="alert" className="error-panel">
        <p>{error}</p>
        <button
          className="outline-button"
          onClick={() => setRetry((n) => n + 1)}
        >
          {t("Try again", "আবার চেষ্টা করুন")}
        </button>
      </div>
    );
  if (!data)
    return (
      <div className="loading-panel" role="status">
        <LoaderCircle className="animate-spin" />
        {t("Loading seller profile…", "বিল্ডারের পরিচিতি লোড হচ্ছে…")}
      </div>
    );
  return (
    <>
      <div className="eyebrow">
        {t("MEET THE BUILDER", "বিল্ডারের পরিচিতি")}
      </div>
      <div className="seller-profile-heading">
        <span className="avatar remi">{data.seller.name[0]}</span>
        <h2>{data.seller.name}</h2>
      </div>
      <p>
        {t("Member since", "যোগ দিয়েছেন")}{" "}
        {new Date(data.seller.created_at).toLocaleDateString(
          lang === "bn" ? "bn-BD" : "en-US",
          { year: "numeric", month: "long" },
        )}
      </p>
      <div className="notice">
        {t(
          "A public builder profile. Review each project’s license and recorded findings before purchasing.",
          "বিল্ডারের প্রকাশ্য প্রোফাইল। কেনার আগে প্রতিটি প্রজেক্টের লাইসেন্স ও রিভিউয়ের ফল পড়ুন।",
        )}
      </div>
      <h3>{t("Published projects", "প্রকাশিত প্রজেক্ট")}</h3>
      <div className="seller-projects">
        {data.products.length ? (
          data.products.map((p) => (
            <button key={p.id} onClick={() => onProject(p)}>
              <span>
                <b>{p.name}</b>
                <small>{p.technology.join(" · ")}</small>
              </span>
              <span>
                {money(p.price_cents)} <ArrowUpRight size={14} />
              </span>
            </button>
          ))
        ) : (
          <p>
            {t(
              "No published projects yet.",
              "এখনো কোনো প্রজেক্ট প্রকাশিত হয়নি।",
            )}
          </p>
        )}
      </div>
    </>
  );
}
