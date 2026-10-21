import dashboard from './icons/dashboard.svg?raw';
import group from './icons/group.svg?raw';
import logout from './icons/logout.svg?raw';
import settings from './icons/settings.svg?raw';

const icons: Record<string, string> = {
  'dashboard.svg': dashboard,
  'group.svg': group,
  'logout.svg': logout,
  'settings.svg': settings,
};

export function iconSvg(name: string): string {
  return icons[name] ?? '';
}
