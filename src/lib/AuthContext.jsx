// 此遊戲使用 guest session 不需要登入
export const AuthProvider = ({ children }) => children;
export const useAuth = () => ({
  user: null,
  isAuthenticated: false,
  isLoadingAuth: false,
  isLoadingPublicSettings: false,
  authError: null,
});
