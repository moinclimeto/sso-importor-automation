import ScrapedDashboard from '../components/ScrapedDashboard.jsx'; 

export default function CpcbDashboard() { 
  const dummyCompany = { name: "Your Company" };
  return <ScrapedDashboard company={dummyCompany} onBack={() => window.history.back()} />; 
}
