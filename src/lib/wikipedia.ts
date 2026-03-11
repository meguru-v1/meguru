/**
 * Wikipedia API (Wikimedia Commons) を使用して、検索ワードに関連する高画質な代表画像を取得する
 */

export async function fetchWikipediaImage(query: string, maxSize: number = 1200): Promise<string | null> {
    try {
        // 特定の施設名や単語で検索し、最も関連性の高いページの代表画像をサムネイル指定サイズで取得
        const url = `https://ja.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&prop=pageimages&pithumbsize=${maxSize}&format=json&origin=*`;
        
        const response = await fetch(url);
        if (!response.ok) return null;

        const data = await response.json();
        const pages = data.query?.pages;
        
        if (!pages) return null;

        // 検索結果の1件目のページIDを取得
        const pageId = Object.keys(pages)[0];
        const page = pages[pageId];

        // ページに代表画像 (thumbnail) が設定されていればソースURLを返す
        if (page && page.thumbnail && page.thumbnail.source) {
            return page.thumbnail.source;
        }

        return null;
    } catch (e) {
        console.warn(`Failed to fetch Wikipedia image for query: ${query}`, e);
        return null;
    }
}
