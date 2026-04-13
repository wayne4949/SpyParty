import { useNavigate } from 'react-router-dom';

export default function PageNotFound() {
  const navigate = useNavigate();
  return (
    <div style={{ textAlign: 'center', padding: '60px' }}>
      <h1>404 - 找不到頁面</h1>
      <button onClick={() => navigate('/')}>回首頁</button>
    </div>
  );
}
