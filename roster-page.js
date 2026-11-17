    const rosterUrl = new URL(window.location.href);
    const rosterId = rosterUrl.searchParams.get('squadra') || rosterUrl.hash.slice(1);
    const roster = document.getElementById(rosterId);
    if (roster?.classList.contains('roster-team')) {
      const name = roster.querySelector('h2').textContent;
      const summary = roster.querySelector('.eyebrow').textContent;
      const emblem = roster.querySelector('.badge').cloneNode();
      emblem.removeAttribute('class');
      document.title = name + ' | Rose · Winter Preseason Cup';
      document.getElementById('roster-title').textContent = name;
      document.getElementById('roster-description').textContent = summary;
      const emblemHolder = document.getElementById('squad-emblem');
      emblemHolder.append(emblem);
      emblemHolder.hidden = false;
      document.getElementById('roster-back').hidden = false;
      document.getElementById('roster-index').hidden = true;
      roster.setAttribute('aria-labelledby', 'roster-title');
      for (const group of roster.querySelectorAll('.roster-group')) {
        if (group.querySelector('h3').textContent === 'Staff e dirigenti') {
          group.classList.add('roster-staff');
        }
      }
      roster.classList.add('is-selected');
      document.body.classList.add('roster-detail');
      if (rosterUrl.hash === '#' + rosterId) {
        rosterUrl.searchParams.set('squadra', rosterId);
        rosterUrl.hash = '';
        history.replaceState(null, '', rosterUrl);
      }
    }
