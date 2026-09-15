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
        <h2>Computer</h2>
        <ol>
          <li>Open Float in Chrome or Edge.</li>
          <li>Look for the install icon in the address bar.</li>
          <li>Select <strong>Install</strong>.</li>
        </ol>
      </section>
    </div>
  );
}
