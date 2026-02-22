function Login({ onLogin, disabled = false }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-row">
          <div className="brand-logo">M</div>
          <h1>MeetLite</h1>
        </div>
        <p>Welcome to MeetLite - secure meetings with Cognito sign-in</p>
        <button type="button" className="google-btn" onClick={onLogin} disabled={disabled}>
          Login with Cognito
        </button>
      </section>
    </main>
  )
}

export default Login
