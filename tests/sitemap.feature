Feature: The sitemap lists the built pages by default, with real lastmod, and reports when empty

  @criterion-1
  Scenario: A site with no sitemap sources gets a sitemap of its built pages
    Given an Astro site using astro-meta with no sitemap sources configured
    When the site is built
    Then sitemap.xml lists every HTML page the build emitted, as absolute URLs on the configured site
    And it lists no route that the build did not emit

  @criterion-2
  Scenario: Pages built from content collections are in the sitemap
    Given an Astro site whose pages are rendered from a content collection
    When the site is built
    Then sitemap.xml lists each rendered collection page

  @criterion-3
  Scenario: Configured sources add to and override the built pages
    Given a sitemap source that returns an entry for a built page with its own lastmod, and an entry for a URL the build did not emit
    When the site is built
    Then the built page appears once, with the source's lastmod
    And the extra URL is listed

  @criterion-4
  Scenario: lastmod reflects when the page's content changed, not when it was built
    Given a page whose content last changed on a known date
    When the site is built on a later date, from a fresh checkout
    Then that page's lastmod is the date its content changed
    And no entry's lastmod is the build time

  @criterion-5
  Scenario: A page with no known change date carries no lastmod
    Given a built page for which no change date can be determined
    When the site is built
    Then its sitemap entry has no lastmod element

  @criterion-6
  Scenario: An empty sitemap is reported
    Given a site whose build would produce a sitemap with no entries
    When the site is built
    Then the build reports that the sitemap is empty, naming sitemap.xml
