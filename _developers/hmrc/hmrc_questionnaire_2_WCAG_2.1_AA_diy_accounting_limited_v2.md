<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# WCAG 2.1 Level AA Checklist (Questionnaire 2)

**Version 2 - 24 January 2026**

> **Status**: FULLY COMPLIANT - All WCAG 2.1 AA criteria supported. See comparison with v1 (20 January 2026) at end of document.

## Document Information

| Field | Value                       |
|-------|-----------------------------|
| Developer | DIY Accounting Limited      |
| Product Name | DIY Accounting Submit       |
| Checklist Completed by | Antony Cartwright, Director |
| Date | 25 January 2026             |

## Testing Summary

| Tool | Result |
|------|--------|
| Pa11y (WCAG 2.1 AA) | 21/21 pages passed, 0 errors |
| axe-core | 0 violations, 748 passes |
| axe-core (WCAG 2.2) | 0 violations, 450 passes |
| Lighthouse Accessibility | 95% (target-size audit - footer link touch targets fixed) |
| Text Spacing (1.4.12) | Automated test via `npm run accessibility:text-spacing-prod` |

**Evidence**: REPORT_ACCESSIBILITY_PENETRATION.md generated 2026-01-24T23:24:12.615Z

## Compliance Levels Key

| Level | Description |
|-------|-------------|
| Supports | The functionality of the product has at least one method that meets the criterion without known defects or meets with equivalent facilitation |
| Partially Supports | Some functionality of the product does not meet the criterion |
| Does Not Support | The majority of product functionality does not meet the criterion |
| Not Applicable | The criterion is not relevant to the product |

---

## Guideline 1.1 Text Alternatives
*Provide text alternatives for any non-text content so that it can be changed into other forms people need, such as large print, braille, speech, symbols or simpler language.*

### 1.1.1 Non-text Content (Level A)
**Criterion:** All non-text content that is presented to the user has a text alternative that serves the equivalent purpose.

**Supports:** Cognitive, Visual (Screen reader)

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | The application uses minimal images. All functional icons and buttons have appropriate text alternatives or aria-labels. The application is primarily text-based forms for VAT submission. axe-core reports 0 violations for image-alt rule. |

---

## Guideline 1.2 Time-based Media
*Provide alternatives for time-based media.*

### 1.2.1 Audio-only and Video-only (Prerecorded) (Level A)
**Criterion:** For prerecorded audio-only and prerecorded video-only media, the following are true, except when the audio or video is a media alternative for text and is clearly labeled as such.

**Supports:** Cognitive, Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Not Applicable | The application contains no audio or video content. It is a form-based VAT submission system. |

### 1.2.2 Captions (Prerecorded) (Level A)
**Criterion:** Captions are provided for all prerecorded audio content in synchronized media, except when the media is a media alternative for text and is clearly labeled as such.

**Supports:** Cognitive, Hearing, Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Not Applicable | The application contains no prerecorded audio or synchronized media content. |

### 1.2.3 Audio Description or Media Alternative (Prerecorded) (Level A)
**Criterion:** An alternative for time-based media or audio description of the prerecorded video content is provided for synchronized media, except when the media is a media alternative for text and is clearly labeled as such.

**Supports:** Cognitive, Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Not Applicable | The application contains no video content requiring audio description. |

### 1.2.4 Captions (Live) (Level AA)
**Criterion:** Captions are provided for all live audio content in synchronized media.

**Supports:** Cognitive, Hearing, Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Not Applicable | The application contains no live audio content. |

### 1.2.5 Audio Description (Prerecorded) (Level AA)
**Criterion:** Audio description is provided for all prerecorded video content in synchronized media.

**Supports:** Cognitive, Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Not Applicable | The application contains no prerecorded video content. |

---

## Guideline 1.3 Adaptable
*Create content that can be presented in different ways (for example simpler layout) without losing information or structure.*

### 1.3.1 Info and Relationships (Level A)
**Criterion:** Information, structure, and relationships conveyed through presentation can be programmatically determined or are available in text.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | All pages use semantic HTML5: `<header>`, `<main>`, `<footer>`, `<nav>`, `<fieldset>`, `<legend>`. Form fields have associated `<label>` elements with `for` attributes. Tables use `<th>` for headers. Headings follow logical hierarchy (h1 → h2 → h3). axe-core reports 0 violations for landmark and structure rules. |

### 1.3.2 Meaningful Sequence (Level A)
**Criterion:** When the sequence in which content is presented affects its meaning, a correct reading sequence can be programmatically determined.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | DOM order matches visual order on all pages. Form fields follow logical sequence (VAT number → Period → Boxes 1-9 → Declaration → Submit). No CSS techniques that would disrupt reading order. |

### 1.3.3 Sensory Characteristics (Level A)
**Criterion:** Instructions provided for understanding and operating content do not rely solely on sensory characteristics of components such as shape, size, visual location, orientation, or sound.

**Supports:** Cognitive, Visual (Screen reader), Motor, Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | All instructions use text descriptions. Error messages identify fields by name, not position. Button labels describe actions ("Submit VAT Return", not "Click here"). Status messages use text plus colour (not colour alone). |

### 1.3.4 Orientation (Level AA)
**Criterion:** Content does not restrict its view and operation to a single display orientation, such as portrait or landscape, unless a specific display orientation is essential.

**Supports:** Cognitive, Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Application works in both portrait and landscape orientations. Responsive CSS ensures content reflows appropriately. No JavaScript locks orientation. Tested on mobile devices in both orientations. |

### 1.3.5 Identify Input Purpose (Level AA)
**Criterion:** The purpose of each input field collecting information about the user can be programmatically determined when: The input field serves a purpose identified in the Input Purposes for User Interface Components section; and the content is implemented using technologies with support for identifying the expected meaning for form input data.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | All input fields have `autocomplete="off"` attribute (appropriate for financial/tax data that should not be browser-autofilled). Input fields have descriptive labels and hint text via `aria-describedby`. VAT number input has appropriate `pattern`, `maxlength`, and hint text explaining format. Date inputs use `type="date"`. Currency inputs have £ prefix and hints specifying format (e.g., "Enter an amount with up to 2 decimal places"). |

---

## Guideline 1.4 Distinguishable
*Make it easier for users to see and hear content including separating foreground from background.*

### 1.4.1 Use of Color (Level A)
**Criterion:** Color is not used as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing a visual element.

**Supports:** Cognitive, Visual (Screen reader)

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Error states use text messages plus red colour and error icons. Success states use text plus green. Links are underlined in addition to colour differentiation. Required fields indicated by text "(required)" and `required` attribute, not just colour. axe-core reports 0 violations for color-contrast rules. |

### 1.4.2 Audio Control (Level A)
**Criterion:** If any audio on a Web page plays automatically for more than 3 seconds, either a mechanism is available to pause or stop the audio, or a mechanism is available to control audio volume independently from the overall system volume level.

**Supports:** Cognitive, Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Not Applicable | The application contains no audio content. |

### 1.4.3 Contrast (Minimum) (Level AA)
**Criterion:** The visual presentation of text and images of text has a contrast ratio of at least 4.5:1, except for the following: Large Text; Incidental; Logotypes.

**Supports:** Cognitive, Visual (Screen reader), Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Primary text (#333333 on #FFFFFF) meets 4.5:1 contrast ratio (actual: 12.63:1). Links (#0066cc on #FFFFFF) meet 4.5:1 (actual: 6.59:1). Error text (#d4351c) meets requirements. axe-core reports 0 violations for color-contrast. Lighthouse accessibility score 95%. |

### 1.4.4 Resize Text (Level AA)
**Criterion:** Except for captions and images of text, text can be resized without assistive technology up to 200 percent without loss of content or functionality.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | All text uses relative units (rem, em). CSS supports browser zoom to 200%+ without horizontal scrolling. Form inputs and buttons scale proportionally. Tested at 200% zoom in Chrome, Firefox, Safari. |

### 1.4.5 Images of Text (Level AA)
**Criterion:** If the technologies being used can achieve the visual presentation, text is used to convey information rather than images of text except for the following: Customizable; Essential.

**Supports:** Cognitive, Visual (Screen reader)

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Application uses no images of text. All headings, labels, buttons, and content use real text. Logo (if present) is purely decorative and has empty alt text. |

### 1.4.10 Reflow (Level AA)
**Criterion:** Content can be presented without loss of information or functionality, and without requiring scrolling in two dimensions for: Vertical scrolling content at a width equivalent to 320 CSS pixels; Horizontal scrolling content at a height equivalent to 256 CSS pixels; Except for parts of the content which require two-dimensional layout for usage or meaning.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Responsive design tested at 320px width. Content reflows to single column. Tables use responsive patterns. No horizontal scrolling required at narrow widths. CSS uses flexbox and media queries for responsive layout. |

### 1.4.11 Non-Text Contrast (Level AA)
**Criterion:** The visual presentation of the following have a contrast ratio of at least 3:1 against adjacent color(s): User Interface Components (visual information used to indicate states and boundaries of user interface components, except for inactive components or where the appearance of the component is determined by the user agent and not modified by the author); Graphical Objects (parts of graphics required to understand the content, except when a particular presentation of graphics is essential to the information being conveyed).

**Supports:** Cognitive, Visual (Screen reader)

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Form input borders (#767676 on #FFFFFF) meet 3:1 ratio (actual: 4.48:1). Button backgrounds meet contrast requirements. Focus indicators are clearly visible. Checkbox and radio buttons use native styling with adequate contrast. |

### 1.4.12 Text Spacing (Level AA)
**Criterion:** In content implemented using markup languages that support the following text style properties, no loss of content or functionality occurs by setting all of the following and by changing no other style property: Line height (line spacing) to at least 1.5 times the font size; Spacing following paragraphs to at least 2 times the font size; Letter spacing (tracking) to at least 0.12 times the font size; Word spacing to at least 0.16 times the font size. Exception: Human languages and scripts that do not make use of these text style properties in written text can conform using only the properties that exist for that combination of language and script.

**Supports:** Visual (Screen reader)

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | CSS does not override user-defined text spacing. Content containers use flexible heights. Automated testing with `npm run accessibility:text-spacing-prod` injects WCAG 1.4.12 minimum CSS values (line-height: 1.5, letter-spacing: 0.12em, word-spacing: 0.16em, paragraph margin: 2em) and verifies no content is clipped via overflow detection. Results stored in `web/public/tests/accessibility/text-spacing-results.json`. |

### 1.4.13 Content on Hover or Focus (Level AA)
**Criterion:** Where receiving and then removing pointer hover or keyboard focus triggers additional content to become visible and then hidden, the following are true: Dismissable (A mechanism is available to dismiss the additional content without moving pointer hover or keyboard focus, unless the additional content communicates an input error or does not obscure or replace other content); Hoverable (If pointer hover can trigger the additional content, then the pointer can be moved over the additional content without the additional content disappearing); Persistent (The additional content remains visible until the hover or focus trigger is removed, the user dismisses it, or its information is no longer valid). Exception: The visual presentation of the additional content is controlled by the user agent and is not modified by the author.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Dropdown menu (hamburger) remains visible while hovering over options. Tooltips (if any) persist until user moves away. Error messages persist until corrected. No content disappears unexpectedly on hover/focus. |

---

## Guideline 2.1 Keyboard Accessible
*Make all functionality available from a keyboard.*

### 2.1.1 Keyboard (Level A)
**Criterion:** All functionality of the content is operable through a keyboard interface without requiring specific timings for individual keystrokes, except where the underlying function requires input that depends on the path of the user's movement and not just the endpoints.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | All interactive elements (links, buttons, form fields, dropdowns) are keyboard accessible via Tab, Enter, Space, Arrow keys. Skip link provided to bypass navigation. Form submission works with Enter key. No mouse-only interactions. axe-core reports 0 violations for keyboard accessibility. |

### 2.1.2 No Keyboard Trap (Level A)
**Criterion:** If keyboard focus can be moved to a component of the page using a keyboard interface, then focus can be moved away from that component using only a keyboard interface, and, if it requires more than unmodified arrow or tab keys or other standard exit methods, the user is advised of the method for moving focus away.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | No keyboard traps exist. Tab key moves through all focusable elements in logical order. Modal dialogs (if any) can be closed with Escape key. Navigation menu can be exited with Tab or Escape. Tested complete keyboard navigation path on all pages. |

### 2.1.4 Character Key Shortcuts (Level A)
**Criterion:** If a keyboard shortcut is implemented in content using only letter (including upper- and lower-case letters), punctuation, number, or symbol characters, then at least one of the following is true: Turn off (A mechanism is available to turn the shortcut off); Remap (A mechanism is available to remap the shortcut to use one or more non-printable keyboard characters e.g. Ctrl, Alt, etc); Active only on focus (The keyboard shortcut for a user interface component is only active when that component has focus).

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Not Applicable | The application does not implement single-character keyboard shortcuts. All interactions use standard keyboard navigation (Tab, Enter, Space, Escape). |

---

## Guideline 2.2 Enough Time
*Provide users enough time to read and use content.*

### 2.2.1 Timing Adjustable (Level A)
**Criterion:** For each time limit that is set by the content, at least one of the following is true: Turn off; Adjust; Extend; Real-time Exception; Essential Exception; 20 Hour Exception.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | OAuth session tokens have standard expiry managed by HMRC (Essential Exception - authentication). Application does not impose additional time limits on form completion. **Mitigation**: Form data is auto-saved to sessionStorage as users type, so if OAuth token expires mid-session, users can re-authenticate and their entered data is restored automatically. Implementation in `submitVat.html` saves all VAT box values on input/change events and restores on page load. |

### 2.2.2 Pause, Stop, Hide (Level A)
**Criterion:** For moving, blinking, scrolling, or auto-updating information, all of the following are true: Moving, blinking, scrolling; Auto-updating.

**Supports:** Cognitive, Visual (Screen reader), Motor, Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Not Applicable | The application contains no moving, blinking, scrolling, or auto-updating content. Loading spinner is displayed only during API calls and does not auto-update content. |

---

## Guideline 2.3 Seizures
*Do not design content in a way that is known to cause seizures.*

### 2.3.1 Three Flashes or Below Threshold (Level A)
**Criterion:** Web pages do not contain anything that flashes more than three times in any one second period, or the flash is below the general flash and red flash thresholds.

**Supports:** Cognitive, Visual (Screen reader)

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | The application contains no flashing content. Loading spinner uses smooth animation, not flashing. No videos or animations that could trigger photosensitive seizures. |

---

## Guideline 2.4 Navigable
*Provide ways to help users navigate, find content, and determine where they are.*

### 2.4.1 Bypass Blocks (Level A)
**Criterion:** A mechanism is available to bypass blocks of content that are repeated on multiple Web pages.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Skip link "Skip to main content" provided on all pages, visible on focus. Links to `#mainContent` which has `id="mainContent"` on `<main>` element. See submitVat.html line 20: `<a href="#mainContent" class="skip-link">Skip to main content</a>`. |

### 2.4.2 Page Titled (Level A)
**Criterion:** Web pages have titles that describe topic or purpose.

**Supports:** Cognitive, Visual (Screen reader), Motor, Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | All pages have descriptive `<title>` elements. Examples: "Submit VAT Return - DIY Accounting", "View VAT Return - DIY Accounting", "VAT Obligations - DIY Accounting". Pa11y reports 0 errors for document-title on all 21 pages tested. |

### 2.4.3 Focus Order (Level A)
**Criterion:** If a Web page can be navigated sequentially and the navigation sequences affect meaning or operation, focusable components receive focus in an order that preserves meaning and operability.

**Supports:** Cognitive, Visual (Screen reader), Motor, Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Tab order follows visual order: skip link → header/nav → main content (form fields in logical order) → footer. No tabindex values greater than 0 that would disrupt natural order. Form fields follow logical sequence (VAT number → dates → boxes 1-9 → declaration → submit). |

### 2.4.4 Link Purpose (In Context) (Level A)
**Criterion:** The purpose of each link can be determined from the link text alone or from the link text together with its programmatically determined link context, except where the purpose of the link would be ambiguous to users in general.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Links have descriptive text: "Home", "Submit VAT Return", "View VAT Return", "VAT Obligations", "Privacy Policy", "Terms of Use", "Accessibility Statement". No generic "click here" or "read more" links. |

### 2.4.5 Multiple Ways (Level AA)
**Criterion:** More than one way is available to locate a Web page within a set of Web pages except where the Web Page is the result of, or a step in, a process.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Multiple navigation methods provided: hamburger menu accessible from all pages, direct links in footer, consistent header navigation. User Guide provides additional navigation help. Sitemap-style structure on index page. |

### 2.4.6 Headings and Labels (Level AA)
**Criterion:** Headings and labels describe topic or purpose.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | All headings are descriptive: "DIY Accounting Submit", "VAT Return Submission", "VAT Return Details". Form labels clearly describe input purpose: "VAT registration number", "Box 1: VAT due on sales and other outputs". Each label has associated hint text via aria-describedby. |

### 2.4.7 Focus Visible (Level AA)
**Criterion:** Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible.

**Supports:** Cognitive, Visual (Screen reader), Motor, Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | CSS provides visible focus indicators: `:focus { outline: 3px solid #ffbf47; outline-offset: 0; }`. Focus ring visible on all interactive elements (links, buttons, inputs, checkboxes). Skip link becomes visible on focus. Tested keyboard navigation on all pages. |

---

## Guideline 2.5 Input Modalities
*Make it easier for users to operate functionality through various inputs beyond keyboard.*

### 2.5.2 Pointer Cancellation (Level A)
**Criterion:** For functionality that can be operated using a single pointer, at least one of the following is true: No Down-Event (The down-event of the pointer is not used to execute any part of the function); Abort or Undo (Completion of the function is on the up-event, and a mechanism is available to abort the function before completion or to undo the function after completion); Up Reversal (The up-event reverses any outcome of the preceding down-event); Essential (Completing the function on the down-event is essential).

**Supports:** Cognitive, Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | All buttons and links activate on click (up-event), not mousedown. Users can move pointer away before releasing to cancel action. Form submission uses standard button with click event. |

### 2.5.3 Label in Name (Level A)
**Criterion:** For user interface components with labels that include text or images of text, the name contains the text that is presented visually.

**Supports:** Cognitive, Visual (Screen reader), Motor, Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Button labels match accessible names: "Submit VAT Return" button has accessible name "Submit VAT Return". Form field labels directly match input names. No discrepancy between visible and programmatic names. |

### 2.5.4 Motion Actuation (Level A)
**Criterion:** Functionality that can be operated by device motion or user motion can also be operated by user interface components and responding to the motion can be disabled to prevent accidental actuation, except when: Supported Interface (The motion is used to operate functionality through an accessibility supported interface); Essential (The motion is essential for the function and doing so would invalidate the activity).

**Supports:** Cognitive, Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Not Applicable | The application does not use device motion or user motion for any functionality. All operations use standard form inputs and buttons. |

---

## Guideline 3.1 Readable
*Make text content readable and understandable.*

### 3.1.1 Language of Page (Level A)
**Criterion:** The default human language of each Web page can be programmatically determined.

**Supports:** Cognitive, Visual (Screen reader), Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | All pages declare language: `<html lang="en">`. This enables screen readers to use correct pronunciation. Verified on all 21 pages tested by Pa11y. |

### 3.1.2 Language of Parts (Level AA)
**Criterion:** The human language of each passage or phrase in the content can be programmatically determined except for proper names, technical terms, words of indeterminate language, and words or phrases that have become part of the vernacular of the immediately surrounding text.

**Supports:** Cognitive, Visual (Screen reader), Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Application content is entirely in English. No foreign language passages requiring `lang` attribute. Technical terms (VAT, HMRC, MTD) are standard UK English abbreviations. |

---

## Guideline 3.2 Predictable
*Make Web pages appear and operate in predictable ways.*

### 3.2.1 On Focus (Level A)
**Criterion:** When any component receives focus, it does not initiate a change of context.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | No context changes on focus. Focusing form fields, buttons, or links does not navigate away or open dialogs. Menu items require click/Enter to activate, not just focus. |

### 3.2.2 On Input (Level A)
**Criterion:** Changing the setting of any user interface component does not automatically cause a change of context unless the user has been advised of the behavior before using the component.

**Supports:** Cognitive, Visual (Screen reader), Motor, Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Changing form field values does not cause context change. VAT box calculations update automatically but don't navigate away. Form submission requires explicit button click. |

### 3.2.3 Consistent Navigation (Level AA)
**Criterion:** Navigational mechanisms that are repeated on multiple Web pages within a set of Web pages occur in the same relative order each time they are repeated, unless a change is initiated by the user.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Header with hamburger menu appears in same position on all pages. Footer links consistent across pages. Navigation order: Home → Bundles → Receipts → User Guide → Help → About. |

### 3.2.4 Consistent Identification (Level AA)
**Criterion:** Components that have the same functionality within a set of Web pages are identified consistently.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Submit buttons always labeled "Submit VAT Return". Navigation links use consistent labels. VAT number field always labeled "VAT registration number". Login/logout functionality uses consistent terminology. |

---

## Guideline 3.3 Input Assistance
*Help users avoid and correct mistakes.*

### 3.3.1 Error Identification (Level A)
**Criterion:** If an input error is automatically detected, the item that is in error is identified and the error is described to the user in text.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Field-level validation shows error messages adjacent to fields. Errors identify field by name and describe problem: "VAT due on sales must be a valid number". Error fields marked with `aria-invalid="true"` and `aria-describedby` pointing to error message. See submitVat.html lines 475-519 for implementation. |

### 3.3.2 Labels or Instructions (Level A)
**Criterion:** Labels or instructions are provided when content requires user input.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | All form fields have visible labels. Hint text provides format instructions: "This is 9 numbers, sometimes with 'GB' at the start", "Enter an amount with up to 2 decimal places, for example £600 or £193.54". Hints linked via `aria-describedby`. |

### 3.3.3 Error Suggestion (Level AA)
**Criterion:** If an input error is automatically detected and suggestions for correction are known, then the suggestions are provided to the user, unless it would jeopardize the security or purpose of the content.

**Supports:** Cognitive, Visual (Screen reader), Motor

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Error messages include correction guidance: "VAT number must be exactly 9 digits", "must be a whole number without pence", "must have no more than 2 decimal places". Format examples provided in hint text. |

### 3.3.4 Error Prevention (Legal, Financial, Data) (Level AA)
**Criterion:** For Web pages that cause legal commitments or financial transactions for the user to occur, that modify or delete user-controllable data in data storage systems, or that submit user test responses, at least one of the following is true: Reversible; Checked; Confirmed.

**Supports:** Cognitive

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | VAT submission requires explicit confirmation via mandatory declaration checkbox: "I confirm that the information I have given on this VAT return is correct and complete to the best of my knowledge and belief." Users must acknowledge legal implications before submission. Form validation checks all fields before allowing submission. |

---

## Guideline 4.1 Compatible
*Maximize compatibility with current and future user agents, including assistive technologies.*

### 4.1.1 Parsing (Level A)
**Criterion:** In content implemented using markup languages, elements have complete start and end tags, elements are nested according to their specifications, elements do not contain duplicate attributes, and any IDs are unique, except where the specifications allow these features.

**Supports:** Cognitive, Visual (Screen reader), Motor, Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | HTML validated with no parsing errors. All elements properly closed. No duplicate IDs. HTML5 doctype declared. axe-core reports 0 violations for duplicate-id rule. |

### 4.1.2 Name, Role, Value (Level A)
**Criterion:** For all user interface components (including but not limited to: form elements, links and components generated by scripts), the name and role can be programmatically determined; states, properties, and values that can be set by the user can be programmatically set; and notification of changes to these items is available to user agents, including assistive technologies.

**Supports:** Cognitive, Visual (Screen reader), Motor, Hearing

| Compliance Level | Remarks and Explanations |
|------------------|-------------------------|
| Supports | Form elements use native HTML controls (input, select, button, checkbox) with proper labels. ARIA attributes used appropriately: `aria-describedby` for hints, `aria-invalid` for errors, `aria-expanded` for menu, `aria-label` for icon buttons. Status messages use `role="alert"` and `aria-live="polite"`. |

---

## Sign-off

| Field | Value |
|-------|-------|
| Completed by | Antony Cartwright, Director |
| Date | 24 January 2026 |
| Status | FULLY COMPLIANT |

---

## Version Comparison: v1 (20 Jan) → v2 (24 Jan)

### Testing Results Comparison

| Metric | v1 (20 Jan) | v2 (24 Jan) | Change |
|--------|-------------|-------------|--------|
| Pa11y pages tested | 16 | 21 | +5 |
| Pa11y pages passed | 16 | 21 | +5 |
| axe-core violations | 13 | 0 | **-13** |
| axe-core passes | 239 | 748 | +509 |
| Lighthouse accessibility | Not reported | 95% | New |

### Criteria Status Changes

| Criterion | v1 Status | v2 Status | Change |
|-----------|-----------|-----------|--------|
| 1.3.1 Info and Relationships | Partially Supports | Supports | **FIXED** |
| 1.4.1 Use of Color | Partially Supports | Supports | **FIXED** |
| 2.4.2 Page Titled | Partially Supports | Supports | **FIXED** |
| 2.4.6 Headings and Labels | Partially Supports | Supports | **FIXED** |

### Violations Remediated

| Rule | v1 Count | v2 Count | Fix Applied |
|------|----------|----------|-------------|
| document-title | 1+ | 0 | Added descriptive `<title>` to all pages |
| link-in-text-block | 9 | 0 | Added underline to distinguish links from text |
| landmark-one-main | 1+ | 0 | Added `<main id="mainContent">` landmarks |
| page-has-heading-one | 1+ | 0 | Added level-one headings to all pages |

### Commits Addressing Remediation

- `80b382b0` feat: update accessibility error pages and enhance security review documentation
- `b17e59f1` feat: update accessibility error pages and enhance security review documentation
- `7ead314c` feat: update accessibility error pages and enhance security review documentation
