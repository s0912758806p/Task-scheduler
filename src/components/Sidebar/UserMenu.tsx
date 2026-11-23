'use client';
// Sidebar footer user button (avatar + name). Its menu shows the email and 登出, which signs out via
// Better Auth and does a full navigation to /login (drops this user's cached data).
import { Avatar, Dropdown, type MenuProps } from 'antd';
import { signOut } from '@/client/authClient';
import { IconLogout } from '@/components/icons';
import styles from './Sidebar.module.scss';

export interface SidebarUser {
  name: string;
  email: string;
  image: string | null;
}

export function UserMenu({ user }: { user: SidebarUser }) {
  const label = user.name || user.email;
  const items: MenuProps['items'] = [
    { key: 'email', label: user.email, disabled: true },
    { type: 'divider' },
    { key: 'logout', label: '登出', icon: <IconLogout /> },
  ];

  const onClick: MenuProps['onClick'] = async ({ key }) => {
    if (key !== 'logout') return;
    await signOut();
    // A full page load on purpose: drops this user's Redux cache and undo stack.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login');
  };

  return (
    <Dropdown menu={{ items, onClick }} trigger={['click']} placement="topLeft">
      <button type="button" className={styles.item} aria-label={`${label} 的帳號選單`}>
        <Avatar size={22} src={user.image ?? undefined} className={styles.avatar}>
          {label.slice(0, 1).toUpperCase()}
        </Avatar>
        <span className={styles.grow}>{label}</span>
      </button>
    </Dropdown>
  );
}
