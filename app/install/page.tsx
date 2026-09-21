import { InstallFloat } from '@/components/install-float';
export const metadata = {
  title: 'Install Float',
  description: 'Save Float to your home screen for quick access.',
};

export default function Page() {
  return (
    <div className="page info-page">
      <h1>Install Float</h1>
      <p className="lede">
        Save Float to your home screen so it opens quickly like an app.
      </p>
      <InstallFloat />
      <section className="panel">
        <h2>iPhone or iPad</h2>
        <ol>
          <li>Open Float in Safari.</li>
          <li>Tap the Share button.</li>
          <li>Choose <strong>Add to Home Screen</strong>, then tap Add.</li>
        </ol>
      </section>
      <section className="panel">
        <h2>Android</h2>
        <ol>
          <li>Open Float in Chrome.</li>
          <li>Tap the menu button <strong>⋮</strong>.</li>
          <li>Choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.</li>
        </ol>
      </section>
      <section className="panel">
        <h2>Computer · Chrome</h2>
        <ol>
          <li>Open Float in a regular Chrome window.</li>
          <li>Open <strong>⋮ → Cast, save, and share</strong>.</li>
          <li>Choose <strong>Install page as app</strong>, then Install.</li>
        </ol>
        <p>The address-bar install icon may also appear. If neither option is available, update Chrome and check that you’re not in Incognito or a managed browser that blocks installation.</p>
        <p>In Edge, use <strong>⋯ → Apps → Install this site as an app</strong>.</p>
      </section>
    </div>
  );
}
