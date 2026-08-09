export default function Landing({ onLogin, onSignup }) {
  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="landing-brand">🍞 Breadcrumbs</span>
        <button className="landing-login" onClick={onLogin}>
          Log in
        </button>
      </header>

      <section className="landing-hero">
        <h1>Know every door your team has knocked.</h1>
        <p>
          Breadcrumbs is the dead-simple canvassing map for door-to-door sales
          teams. Drop a pin at every conversation, tag it cold, warm, or hot,
          and watch your team&apos;s coverage grow street by street.
        </p>
        <div className="landing-cta">
          <button className="btn save landing-primary" onClick={onSignup}>
            Start your team free
          </button>
          <button className="btn cancel" onClick={onLogin}>
            Log in
          </button>
        </div>
      </section>

      <section className="landing-features">
        <div className="landing-card">
          <span className="landing-icon">📍</span>
          <h3>Pin every conversation</h3>
          <p>
            Tap the house you&apos;re standing at — the address fills itself in.
            Tag the temperature, jot a note, move to the next door.
          </p>
        </div>
        <div className="landing-card">
          <span className="landing-icon">🥾</span>
          <h3>Routes that draw themselves</h3>
          <p>
            Hit Start Selling and your walking route traces onto the map.
            Tap any day&apos;s breadcrumb line to replay every conversation on
            it.
          </p>
        </div>
        <div className="landing-card">
          <span className="landing-icon">👥</span>
          <h3>The whole team, one map</h3>
          <p>
            See who covered which streets, filter by rep or lead temperature,
            and never knock the same door twice.
          </p>
        </div>
      </section>

      <footer className="landing-foot">
        Built for small teams that knock. · Breadcrumbs
      </footer>
    </div>
  )
}
