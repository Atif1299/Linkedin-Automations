/**
 * LinkedIn DOM Selectors
 *
 * Centralized selector management.
 * Update ONLY this file when LinkedIn changes their DOM.
 * Last verified: April 2026 (from live DOM HTML captures)
 */

module.exports = {
  feed: {
    /** Main feed content list - where posts are rendered */
    container: '[data-testid="mainFeed"]',

    /** Scroll viewport - the actual scrollable element (NOT mainFeed which is content) */
    scrollContainer: 'main#workspace, div[role="main"][data-sdui-screen*="MainFeed"]',

    /**
     * Post card detection - divs with componentkey containing FeedType_MAIN_FEED_RELEVANCE
     * These are nested inside the mainFeed container, class _4ee1af23 with componentkey
     */
    postCard: '[componentkey*="FeedType_MAIN_FEED_RELEVANCE"], [componentkey*="expanded"][componentkey*="FeedType"]',

    /** Single selector for walk-up / matches() in browser evaluate */
    postCardPrimary: '[componentkey*="FeedType_MAIN_FEED_RELEVANCE"]',

    /** Fallback when primary doesn't match (A/B tests, layout changes) */
    postCardFallback: 'div._4ee1af23[componentkey*="expanded"], div[componentkey*="FeedType_MAIN_FEED"]',

    /** Screen reader indicator that confirms this is a feed post */
    postIndicator: 'h2 span.dec01ee6',

    /**
     * Post text content - data-testid is very stable
     * This is the expandable text box containing the actual post content
     */
    postText: '[data-testid="expandable-text-box"]',

    /**
     * Author information selectors
     */
    postAuthor: 'p.fa3ef5cf._6cf295d9, p._3a5099c8._6cf295d9',
    postAuthorSubtitle: 'p.fa3ef5cf._45b37771, p._3a5099c8._5db1d4dc',
    postTimestamp: 'p._3a5099c8._5db1d4dc._8979cb36',

    /** Author profile link */
    authorLink: 'a[href*="/in/"], a[href*="/company/"]',

    /** Post URN is embedded in componentkey attributes */
    postId: '[componentkey*="urn:li:ugcPost"], [componentkey*="urn:li:activity"]',

    /**
     * Comment button - uses componentkey pattern which is stable
     * The button is inside a div with componentkey containing "commentButtonSection"
     */
    commentButton: '[componentkey*="commentButtonSection"] button, button:has(svg#comment-small)',

    /** Comment button fallback using class patterns */
    commentButtonFallback: 'button._5a1cdf99.fca1faf9._1ccc6ab0, button:has(span:text("Comment"))',

    /**
     * Comment input - the contenteditable div where you type
     * Uses aria-label which is stable for accessibility
     */
    commentInput:
      'div[contenteditable="true"][aria-label="Text editor for creating comment"], div.tiptap.ProseMirror[contenteditable="true"], div[contenteditable="true"][role="textbox"]',

    /**
     * Comment submit button - same button as commentButton, it transforms when input has focus
     * When there's text in the input, clicking this submits the comment
     */
    commentSubmit: '[componentkey*="commentButtonSection"] button',

    /** Comment box container */
    commentBox: 'div._1e7e4b9b.a24ee00d, div[componentkey*="commentButtonSection"]',

    /** Show more button for truncated posts */
    showMoreText: '[data-testid="expandable-text-button"], button:has(span:text("more"))',

    /** Job post indicators to skip */
    jobBadge: '[componentkey*="jobPosting"], [data-testid*="job-posting"]',

    /** Reshare indicator */
    reshareIndicator: '[componentkey*="reshared"]',

    /** Social actions bar containing Like, Comment, Repost, Send */
    socialActionsBar: 'div._309883cc._9a47c768, div[componentkey*="socialActionBar"]',

    /** Like button */
    likeButton: 'button[aria-label*="Reaction button"], button:has(svg#thumbs-up-outline-small)',

    /** Repost button */
    repostButton: 'button:has(svg#repost-small)',

    /** Send/Share button */
    sendButton: 'a:has(svg#send-privately-small), button:has(svg#send-privately-small)',

    /** Comments section container */
    commentsSection: '[componentkey*="commentsSectionContainer"], [data-testid*="commentList"]',

    /** Individual comment */
    commentItem: '[componentkey*="replaceableComment_urn:li:comment"]',

    /** Reaction counts display */
    reactionCount: 'span._4df48336:has-text("reaction")',

    /** Comment count display */
    commentCount: 'span._4df48336:has-text("comment")',
  },

  companyPage: {
    /** Follow/Following button on company pages - from top card */
    followButton: '.org-top-card-primary-actions__inner button.org-company-follow-button, button.org-company-follow-button',

    /** Check if already following */
    followingIndicator: 'button.org-company-follow-button.is-following, button[aria-label="Following"]',

    /** Not following state */
    notFollowingButton: 'button.org-company-follow-button:not(.is-following)',

    /** Company name */
    companyName: 'h1.org-top-card-summary__title',

    /** Company tagline */
    companyTagline: 'p.org-top-card-summary__tagline',

    /** Company industry */
    companyIndustry: '.org-top-card-summary-info-list__info-item',

    /** Message button */
    messageButton: 'button[aria-label*="Message"], button[data-test-message-page-button]',

    /** Top card container */
    topCard: 'section.org-top-card',
  },

  profile: {
    name: '.text-heading-xlarge, h1.org-top-card-summary__title',
    headline: '.text-body-medium',
    connectButton: 'button[aria-label*="Connect"]',
    followButton: 'button[aria-label*="Follow"]',
  },

  search: {
    searchInput: '.search-global-typeahead__input',
    resultItem: '.search-results-container .entity-result',
    resultLink: '.entity-result__title-text a',
  },

  general: {
    /** Main scrollable viewport for feed */
    scrollContainer: 'main#workspace, div[role="main"][data-sdui-screen*="MainFeed"]',

    /** Feed tab link */
    feedTab: 'a[href="/feed/"]',

    /** Notification bell */
    notificationBell: '#notifications-nav-item',

    /** Messaging tab */
    messagingTab: '#messaging-nav-item',

    /** New posts button that appears when scrolling */
    newPostsButton: 'button:has(span:text("New posts"))',
  },

  navigation: {
    home: 'a[href="/feed/"]',
    myNetwork: 'a[href="/mynetwork/"]',
    messaging: 'a[href="/messaging/"]',
    notifications: 'a[href="/notifications/"]',
  },
};
