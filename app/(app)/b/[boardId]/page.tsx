// Board page /b/[boardId] (spec §9 「看板頁」): renders BoardView for the board in the URL. Data,
// not-found and loading states are handled client-side by BoardView.
import { BoardView } from '@/components/BoardView/BoardView';

export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  return <BoardView boardId={boardId} />;
}
