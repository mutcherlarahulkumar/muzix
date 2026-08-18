// The play order for a room.
//
// Most-upvoted first, and on a tie the song that was added first wins. That
// tiebreak isn't cosmetic: the room list and the "what plays next" lookup used
// to sort separately, so with two songs on equal votes the list could show one
// at the top while the player started the other. One function, used by both.
//
// MongoDB ObjectIds start with a 4-byte timestamp and increase monotonically
// within a process, so ordering by _id is ordering by insertion.

export function orderQueue(songs) {
    return [...songs].sort((a, b) => {
        const byVotes = (b.upvotes || 0) - (a.upvotes || 0);
        if (byVotes !== 0) return byVotes;
        return String(a._id).localeCompare(String(b._id));
    });
}

// The equivalent sort spec for anything that sorts inside MongoDB, so the two
// paths can't drift apart.
export const QUEUE_SORT = { upvotes: -1, _id: 1 };
