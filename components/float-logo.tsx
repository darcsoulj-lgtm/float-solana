export function FloatMark({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`float-mark${small ? ' float-mark-small' : ''}`}
      aria-hidden="true"
    >
      <img src="/brand/float-mark.png" alt="" width={1254} height={1254} />
    </span>
  );
}

export function FloatLogo({ admin = false }: { admin?: boolean }) {
  return (
    <>
      <FloatMark />
      <strong className="float-wordmark">
        Float{admin && <small>ADMIN</small>}
      </strong>
    </>
  );
}
