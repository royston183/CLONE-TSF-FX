// Navigation for the vendored screens, over this application's router (react-router-dom): the hooks the screens use
// (usePathname, useSearchParams, useRouter) and a <Link>.
import { useMemo, useState, type AnchorHTMLAttributes } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';

export interface Router {
  push: (href: string) => void;
  replace: (href: string) => void;
  refresh: () => void;
  back: () => void;
}

export const usePathname = (): string => useLocation().pathname;
export function useSearchParams(): URLSearchParams {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}
export function useRouter(): Router {
  const navigate = useNavigate();
  return useMemo<Router>(() => ({
    push: href => navigate(href),
    replace: href => navigate(href, { replace: true }),
    refresh: () => undefined,
    back: () => navigate(-1)
  }), [navigate]);
}
export function useNavVersion(): number {
  const [version] = useState(0);
  return version;
}
export function NavProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string };
export function Link({ href, ...rest }: LinkProps) { return <RouterLink to={href} {...rest} />; }
