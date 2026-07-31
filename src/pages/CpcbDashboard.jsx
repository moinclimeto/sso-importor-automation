import ScrapedDashboard from '../components/ScrapedDashboard.jsx'; 

export default function CpcbDashboard() { 
  const dummyCompany = { name: "Honourable Packaging Private Limited" };
  return <ScrapedDashboard company={dummyCompany} onBack={() => window.history.back()} />; 
}
