import { Link } from 'react-router';
import { supabase } from '~/lib/supabase';

const Navbar = () => {
  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Sign out failed:', error.message);
  };

  return (
    <nav className="navbar">
      <Link to="/">
        <p className="text-2xl font-bold text-gradient">HireLens AI</p>
      </Link>
      <div className="flex items-center gap-4">
        <Link to="/upload" className="primary-button w-fit">
          Upload Resume
        </Link>
        <button
          onClick={handleSignOut}
          className="text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Sign Out
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
