import { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
};

const featureItems = [
  {
    icon: "bolt",
    title: "Instant Sync",
    text: "Zero-latency updates across all distributed team members.",
  },
  {
    icon: "history_edu",
    title: "Version Control",
    text: "Granular history tracking with cryptographic integrity.",
  },
  {
    icon: "terminal",
    title: "Editorial API",
    text: "Programmable document workflows for technical teams.",
  },
];

const avatarUrls = [
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDNGD36LDuOIMvk0rSYMhL7UFNPmbT_-uBoUYfpNmHcjMrjChH6JmVcfp5TjiW4cAj9uG5AwJnwOLn1y66hVhSe1SHoxWr81CP2FmnZ5FfrFyp-jZuU3raa-UPVr_r8Uw9_-ztBYkjTzrzapHh5sQwMwK0HhrT6NSMwlFPEckpUoWvuFnzBDjRsqGlbVO12Hsdh6Fw1WHztzLEW0RvkJXLAb70cM9T-QEWna7tmjox1FpIeIAi4_CQA2FB9PO_EjufwQ88uxP_JF_I",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuC5_e8-DtQ8rSHVHN6bgkgU-Q8dfU13q4y8WEDW6biJUkSfgbXZivydRJiomlCzLZqxV_PsmG45MvCXopqk2pRx90GORvI6Dd-swD5l9HachlpZn9tB-xQ9FNxWBde6HqRM9qwRyY9ktt30HPpxcie5mDpuA6y9XLgvJnsD1BexenwggQE_Q6b_oYIEw4BIOW8yEI0FfHzxLBJMdJepvhxDM6XVraqd4jxdS8oph2cN5GuYULDa-secJ3ySwBk91G-WFpoA01630Z4",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCiqzr_qci3ekT-rhlbSlz1vqj0NgZYYIcyMkTVB7DvranDn5LDZnMp7LAFuAPxxWXZDDI3daIhGtorbPqA9buorbMzpbsrA05U117e-EmbtOdIz08LLIlKz0r_1ipeoo8YGpxCGGo4bhsslIZZzQxKkvxW8z9rQokMO9ckM4CmZcdFd2hLftqkooH3imrHmCbBjZK84oUgnwU5Lw2H14gnMxHjSzRpLxPZSLuV1UDKlnX-QsiEbi-q9yAsKyTTboXODnFxBa6UmBs",
];

const AuthShell = ({ title, subtitle, children, footer }: AuthShellProps) => {
  return (
    <main className="flex min-h-screen w-full overflow-hidden bg-surface-container-lowest">
      <section className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-surface-container-lowest p-16 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-5"
          style={{
            backgroundImage:
              "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAGWLRaApxbcHYCHeLJNWvFqT47A9wqJV8Wi16SdfxJhFUaqzlVRfgl69tCx_vdxNa-RRwO1FqtbCzcQj2glG3AgqhffJ85GsarKIP2BHgHFox_wfeDK0WwgtVcMjqkDaFQ29oo5LZOnykKAGaxe9_mlJUZCN9hKSICwQY0Osoie6L5-6ll5mcfNB155RGR8XwQ9him3zmSYxmnvsnmgKw2mi9cgDyAb0nNuXzTwvoF-GfMbGPb12y2Qk8NQ9hpBLMGsHcbRwH9oSo')",
          }}
        />

        <div className="relative z-10">
          <div className="mb-24 flex items-center gap-2">
            <span className="text-xl font-bold uppercase tracking-tighter text-white">Editorial</span>
            <div className="h-1.5 w-1.5 bg-primary" />
          </div>

          <div className="max-w-md">
            <h1 className="mb-8 text-6xl font-extrabold leading-[0.95] tracking-tighter text-white">
              Collaborate in <span className="text-primary">real-time.</span>
            </h1>
            <p className="mb-12 text-lg font-medium text-on-surface-variant">
              A precision-engineered workspace for high-performance teams to write, review, and
              ship documentation.
            </p>

            <div className="space-y-8">
              {featureItems.map((item) => (
                <div key={item.title} className="group flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container transition-colors group-hover:border-primary/50">
                    <span className="material-symbols-outlined text-primary">{item.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-tight text-white">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-sm text-on-surface-variant">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-6">
          <div className="flex -space-x-3">
            {avatarUrls.map((avatarUrl) => (
              <img
                key={avatarUrl}
                alt="User"
                className="h-8 w-8 rounded-full border-2 border-surface-container-lowest object-cover"
                src={avatarUrl}
              />
            ))}
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            Trusted by 2k+ labs
          </p>
        </div>
      </section>

      <section className="relative flex w-full items-center justify-center bg-surface p-6 lg:w-1/2">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-[120px]" />
          <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-primary/5 blur-[120px]" />
        </div>

        <div className="relative z-10 w-full max-w-md">
          <div className="glass-panel rounded-lg border border-outline-variant/10 p-10 shadow-2xl">
            <div className="mb-10">
              <div className="mb-8 flex items-center gap-2 lg:hidden">
                <span className="text-xl font-bold uppercase tracking-tighter text-white">
                  Editorial
                </span>
                <div className="h-1.5 w-1.5 bg-primary" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
              <p className="mt-2 text-sm text-on-surface-variant">{subtitle}</p>
            </div>

            {children}

            <div className="mt-12 text-center text-sm font-medium text-on-surface-variant">
              {footer}
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between px-4">
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.2em] text-outline/40">
              <span>v2.4.0-stable</span>
              <div className="h-1 w-1 rounded-full bg-outline/20" />
              <span>secured by aes-256</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                System Online
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default AuthShell;
