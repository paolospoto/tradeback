import Image from "next/image";
import Link from "next/link";
import { HelpWizard } from "@/components/help/HelpWizard";
import { t } from "@/lib/i18n";
import { SOURCE_URL } from "@/lib/site";
import styles from "./SiteChrome.module.css";

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.logo} href="/" aria-label={t.site.name}>
          {/* The lockup holds the mark and the wordmark; the SVG is already optimised. */}
          <Image
            className={styles.lockup}
            src="/brand/lockup-dark.svg"
            alt={t.site.name}
            width={152}
            height={30}
            unoptimized
            priority
          />
        </Link>
        <div className={styles.actions}>
          <a
            className={styles.githubLink}
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            data-testid="github-link"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path fill="currentColor" d={GITHUB_PATH} />
            </svg>
          </a>
          <HelpWizard />
        </div>
      </div>
    </header>
  );
}

const GITHUB_PATH =
  "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z";

export function SiteFooter() {
  const f = t.footer;
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerTop}>
          <p className={styles.privacy}>
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
              <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
            </svg>
            {f.privacy}
          </p>
          <nav className={styles.footerLinks} aria-label="Links">
            <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path fill="currentColor" d={GITHUB_PATH} />
              </svg>
              {f.source}
            </a>
            <a href="https://pokeapi.co" target="_blank" rel="noopener noreferrer">
              {f.artwork}
            </a>
          </nav>
        </div>
        <p className={styles.legal}>{f.legal}</p>
      </div>
    </footer>
  );
}

export { styles as chromeStyles };
