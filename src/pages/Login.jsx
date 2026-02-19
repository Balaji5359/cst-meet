function Login({ onNavigate }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-row">
          <div className="brand-logo">M</div>
          <h1>MeetLite</h1>
        </div>
        <p>Simple meetings UI inspired by modern video calls.</p>
        <button
          type="button"
          className="google-btn"
          onClick={() => onNavigate('/dashboard')}
        >
          <span className="google-icon">G</span>
          Sign in with Google
        </button>
      </section>
    </main>
  )
}

export default Login
