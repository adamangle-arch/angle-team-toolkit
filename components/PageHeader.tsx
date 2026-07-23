export default function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="app-header">
      <h1 className="app-title">{title}</h1>
      {subtitle ? <p className="app-subtitle">{subtitle}</p> : null}
    </header>
  );
}
