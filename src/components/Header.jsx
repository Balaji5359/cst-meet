function Header({ title, subtitle, rightSlot }) {
  return (
    <header className="top-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {rightSlot ? <div>{rightSlot}</div> : null}
    </header>
  )
}

export default Header
