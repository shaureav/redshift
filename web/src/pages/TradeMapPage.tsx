import { PageHeader } from "../components/Common";
import { TradeMapPanel } from "../charts/TradeMapPanel";

export default function TradeMapPage() {
  return (
    <>
      <PageHeader
        title="Trade Map"
        lead="NASA has not yet chosen the cabin atmosphere for lunar habitats. Lower pressure and more oxygen shorten the prebreathe before a spacewalk, but change how fire behaves. This map puts the candidate atmospheres, the fire tests near them and the gaps on one plane. It is a plane, not a score: it ranks nothing and recommends nothing."
      />
      <TradeMapPanel height={640} />
    </>
  );
}
