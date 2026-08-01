export const DEFAULT_CMS_PAGES = [
  {
    "slug": "home",
    "path": "/",
    "title": "Home",
    "body_html": "<section class=\"hero\">\n  <div class=\"wrap\">\n    <div>\n      <div class=\"eyebrow\">East Forsyth High School</div>\n      <h1 data-site-field=\"hero_title\">Sound. Spirit. Eagle Pride.</h1>\n      <p data-site-field=\"hero_subtitle\">A polished home for the East Forsyth Band program — built for students, families, alumni, sponsors, and the Kernersville community.</p>\n      <div class=\"button-row\"><a class=\"btn primary\" href=\"calendar.html\">View Calendar</a><a class=\"btn secondary\" href=\"ensembles.html\">Explore Ensembles</a><a class=\"btn gold\" href=\"sponsors.html\">Support the Band</a></div>\n    </div>\n    <aside class=\"hero-card\"><img src=\"assets/efhs-logo.png\" alt=\"East Forsyth logo\"><h2>Band information in one place</h2><ul><li>Ensembles and program overview</li><li>Upcoming events and rehearsal notes</li><li>Booster, fundraising, and sponsor information</li></ul></aside>\n  </div>\n</section>\n<section>\n  <div class=\"wrap\">\n    <div class=\"section-head\"><div><div class=\"kicker\">Start here</div><h2>Built around the pages families expect.</h2></div><p>Modeled after a full high-school band program site structure, with East Forsyth branding and easy paths for students, parents, sponsors, and visitors.</p></div>\n    <div class=\"grid cards\">\n      <article class=\"card red-card\"><span class=\"tag\">Program</span><h3>Ensembles</h3><p>Marching band, concert bands, percussion, color guard, jazz, and chamber opportunities.</p></article>\n      <article class=\"card red-card\"><span class=\"tag\">Families</span><h3>Resources</h3><p>Forms, handbook links, rehearsal expectations, fees, uniforms, and travel information.</p></article>\n      <article class=\"card red-card\"><span class=\"tag\">Community</span><h3>Sponsors</h3><p>A place for local businesses and alumni to support the program and be recognized.</p></article>\n    </div>\n  </div>\n</section>\n<section class=\"soft\">\n  <div class=\"wrap\">\n    <div class=\"section-head\"><div><div class=\"kicker\">Upcoming</div><h2>Calendar highlights</h2></div><a class=\"btn outline\" href=\"calendar.html\">Full calendar</a></div>\n    <div class=\"timeline\" data-events data-limit=\"3\">\n      <article class=\"event\"><div class=\"datebox\">Aug <span>01</span></div><div><h3>Band Camp / Preseason Prep</h3><p>Placeholder: add official summer band camp dates, times, and location.</p></div></article>\n      <article class=\"event\"><div class=\"datebox\">Sep <span>FRI</span></div><div><h3>Football Game Performance</h3><p>Placeholder: add football schedule and call times when available.</p></div></article>\n      <article class=\"event\"><div class=\"datebox\">Oct <span>TBD</span></div><div><h3>Competition / Festival</h3><p>Placeholder: add event name, itinerary, and family volunteer needs.</p></div></article>\n    </div>\n  </div>\n</section>\n<section>\n  <div class=\"wrap\">\n    <div class=\"section-head\"><div><div class=\"kicker\">Photos</div><h2>Band photo gallery</h2></div><p>Photos uploaded from the admin backend will appear here automatically.</p></div>\n    <div class=\"gallery\" data-photo-gallery>\n      <figure class=\"gallery-item\"><img src=\"assets/efhs-photo-1.png\" alt=\"East Forsyth school building\"><figcaption>Upload band photos from the admin area.</figcaption></figure>\n      <figure class=\"gallery-item\"><img src=\"assets/efhs-photo-2.png\" alt=\"East Forsyth campus\"><figcaption>Feature performances, rehearsals, and booster events.</figcaption></figure>\n    </div>\n  </div>\n</section>\n<section>\n  <div class=\"wrap grid two\">\n    <article class=\"card accent-card\"><span class=\"tag\">Boosters</span><h3>Parents make the program move.</h3><p>Add booster meeting dates, volunteer signups, concessions, uniforms, meals, transportation, and fundraising needs.</p><p style=\"margin-top:18px\"><a class=\"btn secondary\" href=\"boosters.html\">Booster info</a></p></article>\n    <article class=\"card\"><span class=\"tag\">Launch note</span><h3>This is a first website draft.</h3><p>Because official names, dates, director bios, forms, and contact details were not provided yet, those areas are clearly marked as placeholders.</p><p class=\"draft\">Ready for review, copy replacement, and GitHub publishing.</p></article>\n  </div>\n</section>",
    "nav_order": 0,
    "is_home": 1,
    "active": 1
  },
  {
    "slug": "calendar",
    "path": "/calendar.html",
    "title": "Calendar",
    "body_html": "<section class=\"page-hero\"><div class=\"page-title\"><div class=\"kicker\">Schedule</div><h1>Calendar</h1><p>A clean calendar landing page for rehearsals, performances, booster meetings, and trip deadlines.</p></div></section><section class=\"content soft\"><div class=\"wrap\"><div class=\"timeline\" data-events data-limit=\"5\"><article class=\"event\"><div class=\"datebox\">Aug <span>01</span></div><div><h3>Band Camp / Preseason Prep</h3><p>Placeholder: add official dates, report times, meals, and pickup information.</p></div></article><article class=\"event\"><div class=\"datebox\">Aug <span>TBD</span></div><div><h3>Parent Preview Night</h3><p>Placeholder: add location and what families should bring.</p></div></article><article class=\"event\"><div class=\"datebox\">Sep <span>FRI</span></div><div><h3>Football Game Performance</h3><p>Placeholder: add game schedule and student call time.</p></div></article><article class=\"event\"><div class=\"datebox\">Oct <span>TBD</span></div><div><h3>Marching Competition</h3><p>Placeholder: add itinerary, address, ticket info, and volunteer needs.</p></div></article></div></div></section>",
    "nav_order": 1,
    "is_home": 0,
    "active": 1
  },
  {
    "slug": "contact",
    "path": "/contact.html",
    "title": "Contact",
    "body_html": "<section class=\"page-hero\"><div class=\"page-title\"><div class=\"kicker\">Connect</div><h1>Contact</h1><p>Use this page for director contact information, booster questions, sponsor inquiries, and student/family support.</p></div></section><section class=\"content soft\"><div class=\"wrap grid two\"><article class=\"card\"><span class=\"tag\">East Forsyth Band</span><h3>Contact details TBD</h3><p>Add official phone, email, mailing address, social links, and response expectations here.</p><p style=\"margin-top:14px\"><a class=\"btn outline\" href=\"https://www.wsfcs.k12.nc.us/o/efhs\">Visit EFHS Website</a></p></article><form class=\"card\" onsubmit=\"event.preventDefault(); alert('Demo form only. Connect this to a form provider before launch.');\"><span class=\"tag\">Demo form</span><h3>Send a message</h3><div class=\"form-grid\"><label>Name<input required placeholder=\"Your name\"></label><label>Email<input type=\"email\" required placeholder=\"you@example.com\"></label><label class=\"full\">Topic<select><option>General question</option><option>Sponsor inquiry</option><option>Volunteer interest</option><option>Student resource question</option></select></label><label class=\"full\">Message<textarea required placeholder=\"How can we help?\"></textarea></label></div><p style=\"margin-top:16px\"><button class=\"btn primary\" type=\"submit\">Send demo message</button></p><p class=\"draft\">This form is front-end only until connected to a backend/form service.</p></form></div></section>",
    "nav_order": 2,
    "is_home": 0,
    "active": 1
  },
  {
    "slug": "boosters",
    "path": "/boosters.html",
    "title": "Boosters",
    "body_html": "<section class=\"page-hero\"><div class=\"page-title\"><div class=\"kicker\">Families</div><h1>Band Boosters</h1><p>Make it easy for families to volunteer, attend meetings, and understand how the booster organization supports students.</p></div></section><section class=\"content\"><div class=\"wrap grid two\"><article class=\"card\"><span class=\"tag\">Meetings</span><h3>Booster Meetings</h3><p>Placeholder for monthly meeting schedule, location, board members, bylaws, and minutes.</p></article><article class=\"card accent-card\"><span class=\"tag\">Volunteer</span><h3>Help behind the scenes.</h3><p>Placeholder for signups: concessions, uniforms, props, meals, transportation, chaperones, fundraising, and events.</p><p style=\"margin-top:18px\"><a class=\"btn secondary\" href=\"contact.html\">Volunteer interest</a></p></article></div></section>",
    "nav_order": 3,
    "is_home": 0,
    "active": 1
  },
  {
    "slug": "resources",
    "path": "/resources.html",
    "title": "Student Resources",
    "body_html": "<section class=\"page-hero\"><div class=\"page-title\"><div class=\"kicker\">Students</div><h1>Student Resources</h1><p>One page for documents and quick links students and families need during the season.</p></div></section><section class=\"content\"><div class=\"wrap\"><div class=\"grid cards\"><article class=\"card\"><span class=\"tag\">Handbook</span><h3>Program Handbook</h3><p>Placeholder for handbook PDF, expectations, grading, attendance, and communication policy.</p></article><article class=\"card\"><span class=\"tag\">Forms</span><h3>Required Forms</h3><p>Placeholder for medical, travel, permission, physical, and payment forms.</p></article><article class=\"card\"><span class=\"tag\">Practice</span><h3>Music & Assignments</h3><p>Placeholder for music distribution instructions, practice tracks, and audition material.</p></article></div></div></section>",
    "nav_order": 4,
    "is_home": 0,
    "active": 1
  },
  {
    "slug": "fundraising",
    "path": "/fundraising.html",
    "title": "Fundraising",
    "body_html": "<section class=\"page-hero\"><div class=\"page-title\"><div class=\"kicker\">Support</div><h1>Fundraising</h1><p>Centralize active campaigns, passive giving links, payment information, and fundraiser deadlines.</p></div></section><section class=\"content soft\"><div class=\"wrap\"><div class=\"grid cards\"><article class=\"card\"><span class=\"tag\">Active</span><h3>Current Fundraiser</h3><p>Placeholder for campaign details, student credit rules, order deadlines, and pickup dates.</p></article><article class=\"card\"><span class=\"tag\">Ongoing</span><h3>Restaurant / Spirit Nights</h3><p>Placeholder for local partner nights and percentage-back events.</p></article><article class=\"card\"><span class=\"tag\">Donate</span><h3>Direct Support</h3><p>Placeholder for approved donation/payment link and booster treasurer contact.</p></article></div></div></section>",
    "nav_order": 5,
    "is_home": 0,
    "active": 1
  },
  {
    "slug": "sponsors",
    "path": "/sponsors.html",
    "title": "Sponsors",
    "body_html": "<section class=\"page-hero sponsor-hero\" data-cms-layout=\"sponsors\"><div class=\"page-title\"><div class=\"kicker\" data-cms-field=\"kicker\">Community Partners</div><h1 data-cms-field=\"heading\">Our Sponsors</h1><p data-cms-field=\"intro\">Local businesses, alumni, and families make opportunities possible for every East Forsyth Band student.</p></div></section><section class=\"content sponsor-content\"><div class=\"wrap\"><div class=\"sponsor-intro\"><div data-cms-field=\"body_text\"><div class=\"kicker\">Thank you</div><h2>Community support takes center stage.</h2><p>Our sponsors help provide instruments, instruction, travel, meals, uniforms, and unforgettable performance opportunities.</p></div><a class=\"btn primary\" href=\"contact.html\">Become a sponsor</a></div><div class=\"sponsor-directory\" data-sponsors></div><aside class=\"sponsor-cta\" data-cms-block=\"callout\"><div><span class=\"sponsor-level\">Sponsor opportunities</span><h2 data-cms-field=\"callout_title\">Put your support in the spotlight.</h2><div data-cms-field=\"callout_text\"><p>Ask us about sponsor levels, benefits, artwork requirements, payment instructions, and how your business can support the band.</p></div></div><a class=\"btn secondary\" href=\"contact.html\">Ask about sponsoring</a></aside></div></section>",
    "nav_order": 6,
    "is_home": 0,
    "active": 1
  },
  {
    "slug": "directors",
    "path": "/directors.html",
    "title": "Directors & Staff",
    "body_html": "<section class=\"page-hero\" data-cms-layout=\"directory\"><div class=\"page-title\"><div class=\"kicker\" data-cms-field=\"kicker\">People</div><h1 data-cms-field=\"heading\">Directors & Staff</h1><p data-cms-field=\"intro\">Meet the directors and staff who lead the East Forsyth Band program.</p></div></section><section class=\"content\"><div class=\"wrap\"><div class=\"card\" data-cms-field=\"body_text\"><p>Add a short welcome note for families here. Staff photos and roles are managed in the Directors &amp; Staff admin tab.</p></div><div class=\"directory\" data-staff></div></div></section>",
    "nav_order": 7,
    "is_home": 0,
    "active": 1
  },
  {
    "slug": "ensembles",
    "path": "/ensembles.html",
    "title": "Ensembles",
    "body_html": "<section class=\"page-hero\"><div class=\"page-title\"><div class=\"kicker\">Program</div><h1>Ensembles</h1><p>Use this page to explain every performing group, who can participate, and what families should expect during the year.</p></div></section><section class=\"content\"><div class=\"wrap\"><div class=\"grid cards\"><article class=\"card\"><span class=\"tag\">Fall</span><h3>Marching Band</h3><p>Placeholder for marching band overview, camp requirements, football performances, competitions, and student leadership.</p></article><article class=\"card\"><span class=\"tag\">Concert</span><h3>Concert Bands</h3><p>Placeholder for concert band levels, auditions, rehearsals, assessments, and concert expectations.</p></article><article class=\"card\"><span class=\"tag\">Auxiliary</span><h3>Color Guard</h3><p>Placeholder for guard season details, clinics, auditions, uniforms, and performance opportunities.</p></article><article class=\"card\"><span class=\"tag\">Percussion</span><h3>Percussion</h3><p>Placeholder for battery, front ensemble, concert percussion, equipment expectations, and sectionals.</p></article><article class=\"card\"><span class=\"tag\">Jazz</span><h3>Jazz Ensemble</h3><p>Placeholder for jazz auditions, rehearsal schedule, performances, and instrumentation.</p></article><article class=\"card\"><span class=\"tag\">Small groups</span><h3>Chamber / Solo</h3><p>Placeholder for honor band, all-county, all-district, solo & ensemble, and leadership opportunities.</p></article></div></div></section>",
    "nav_order": 8,
    "is_home": 0,
    "active": 1
  }
];
