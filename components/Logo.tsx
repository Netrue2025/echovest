export function Logo({ compact = false }: { compact?: boolean }) {
  return <a href="/pwa" className="focus-ring site-brand" aria-label="EchoVest home">
    <span className="site-brand-icon"><img src="/echovest-icon.png" alt="" /></span>
    {!compact && <span>EchoVest</span>}
  </a>;
}
