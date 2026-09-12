export function FloatLogo({
  admin = false,
  small = false,
}: {
  admin?: boolean;
  small?: boolean;
}) {
  return (
    <span className={`float-lockup${small ? ' float-lockup-small' : ''}`}>
      <span className="float-wordmark-art" aria-hidden="true" />
      <span className="sr-only">Float</span>
      {admin && <small>ADMIN</small>}
    </span>
  );
}
