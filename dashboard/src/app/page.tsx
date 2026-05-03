import AuthGate from '@/components/AuthGate';
import { ThemeProvider } from '@/components/ThemeProvider';

export default function Home() {
  return (
    <ThemeProvider>
      <main>
        <AuthGate />
      </main>
    </ThemeProvider>
  );
}
