// `/` → 今日焦點. Signed-out visitors never get here: the (app) layout redirects them to /login.
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/focus');
}
