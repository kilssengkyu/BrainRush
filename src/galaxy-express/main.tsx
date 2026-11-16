import { createRoot } from 'react-dom/client';
import { messages } from './messages';
import { policyText } from './policyText';
import './site.css';

// 운영 사이트의 각 문서 진입점에서 같은 레이아웃을 사용합니다.
const pages = ['privacy', 'terms', 'support', 'delete-account'] as const;
const page = pages.find((item) => item === document.body.dataset.page);
const language = new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'ko';
const text = messages[language];
const email = 'galaxyexpress.help@gmail.com';

function pageUrl(target: (typeof pages)[number], locale = language) {
  return `/galaxy-express/${target}/${locale === 'en' ? '?lang=en' : ''}`;
}

if (!page) throw new Error('은하열차 문서 진입점을 확인해 주세요.');

const policy = page === 'privacy' || page === 'terms' ? policyText[language][page] : null;
const deleting = page === 'delete-account';
const subject = encodeURIComponent(`[${text.game}] ${text[page]}`);
const emailUrl = `mailto:${email}?subject=${subject}`;
const title = policy?.title ?? text[page];
document.documentElement.lang = language;
document.title = `${title} · ${text.game}`;

createRoot(document.getElementById('root')!).render(
  <>
    <a className="skip" href="#main">{text.skip}</a>
    <header className="site-header">
      <div className="wrap">
        <div className="brand-row">
          <a className="brand" href={pageUrl('support')}>{text.game}</a>
          <a className="language" href={pageUrl(page, language === 'ko' ? 'en' : 'ko')} lang={language === 'ko' ? 'en' : 'ko'}>
            {language === 'ko' ? 'English' : '한국어'}
          </a>
        </div>
        <nav aria-label={text.navigation}>
          {pages.map((item) => (
            <a href={pageUrl(item)} key={item} aria-current={item === page ? 'page' : undefined}>
              {text[item]}
            </a>
          ))}
        </nav>
      </div>
    </header>
    <main className="wrap" id="main" tabIndex={-1}>
      <article className="document">
        <h1>{title}</h1>
        {policy ? (
          <>
            <aside className="draft"><strong>{text.draft}</strong><p>{text.draftDetail}</p></aside>
            {policy.sections.map((section) => (
              <section key={section.title}>
                <h2>{section.title}</h2>
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </section>
            ))}
          </>
        ) : (
          <>
            <p className="lead">{deleting ? text.deletionLead : text.supportLead}</p>
            <section>
              <h2>{deleting ? text.deletionTipsTitle : text.supportTipsTitle}</h2>
              <p>{deleting ? text.deletionTips : text.supportTips}</p>
              <p>{text.sensitiveData}</p>
              <a className="action" href={emailUrl}>{deleting ? text.deletionAction : text.supportAction}</a>
            </section>
            {deleting && (
              <section>
                <h2>{text.deletionScopeTitle}</h2>
                <p>{text.deletionScope}</p>
                <p>{text.deletionReminder}</p>
                <p>{text.deletionApp}</p>
              </section>
            )}
          </>
        )}
        <footer className="contact">
          <p>{text.operator}</p>
          <p>{text.contact} <a href={emailUrl}>{email}</a></p>
        </footer>
      </article>
    </main>
  </>,
);
