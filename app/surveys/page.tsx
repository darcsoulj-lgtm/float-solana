import { SurveyList } from '@/components/workspace';
export const metadata = { title: 'Research studies' };
export default function Page() {
  return (
    <div className="page">
      <p className="eyebrow">THE HOLDER PERSPECTIVE</p>
      <h1>Your holdings. Your perspective.</h1>
      <p>
        Contribute to focused research about assets you hold. Connect your
        wallet only when you are ready to participate.
      </p>
      <div className="notice">
        Live studies require a wallet signature and verified token holdings.
        Example studies are clearly labeled and contain simulated responses.
        Rewards, where planned, remain unfunded.
      </div>
      <SurveyList />
    </div>
  );
}
