function Login({ onSignInWithGoogle, onSignInWithEmail, onSignUp, disabled = false, errorMessage = '' }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-row">
          <div className="brand-logo">M</div>
          <h1>MeetLite</h1>
        </div>
        <p>Welcome to meet lite - get started with your meetings</p>
        {errorMessage ? <p className="config-error">{errorMessage}</p> : null}
        <button type="button" className="auth-link-btn" onClick={onSignUp} disabled={disabled}>
          Continue to Meetlite
        </button>
      </section>
    </main>
  )
}

export default Login
