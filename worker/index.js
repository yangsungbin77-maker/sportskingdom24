// www.로 들어온 요청은 맨 주소(www 없는 주소)로 영구 이동(301)시킨다.
// 그 밖의 요청은 기존처럼 dist 정적 파일(_redirects·404 포함)을 그대로 돌려준다.
export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.hostname.startsWith('www.')) {
			url.hostname = url.hostname.slice(4);
			return Response.redirect(url.toString(), 301);
		}
		return env.ASSETS.fetch(request);
	},
};
