export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="eyebrow">API monitoring</p>
        <h1>Endpoint Watch</h1>
        <p>A clear view of your services, all in one place.</p>
      </header>
      <main>
        <section className="placeholder" aria-labelledby="welcome-heading">
          <h2 id="welcome-heading">Your monitoring workspace</h2>
          <p>Endpoint status and recent check history will appear here.</p>
          <p className="placeholder-note">The dashboard is under development.</p>
        </section>
      </main>
    </div>
  );
}
