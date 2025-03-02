const path = require('path');
const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');

/** @type {import('@docusaurus/types').DocusaurusConfig} */
module.exports = {
  title: 'Cornerstone.js',
  tagline: 'Medical Imaging, Simplified',
  url: 'https://cornerstonejs.org',
  baseUrl: '/',
  onBrokenLinks: 'log',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',
  organizationName: 'CornerstoneJS', // Usually your GitHub org/user name.
  projectName: 'Cornerstone', // Usually your repo name.
  themeConfig: {
    navbar: {
      logo: {
        alt: 'Cornerstone.js',
        src: 'img/cornerstone-light.png',
        srcDark: 'img/cornerstone-dark.png',
      },
      items: [
        {
          to: 'docs/getting-started/overview',
          position: 'left',
          activeBaseRegex: 'docs/(?!(example|faq|help))',
          label: 'Docs',
        },
        {
          to: 'docs/examples',
          position: 'left',
          label: 'Examples',
        },
        {
          href: 'https://ohif.org/community/',
          position: 'left',
          label: 'Community',
        },
        {
          to: '/api',
          position: 'left',
          label: 'API',
        },
        {
          to: 'docs/help',
          label: 'Help',
          position: 'right',
        },
        {
          label: 'FAQ',
          to: 'docs/faq',
          position: 'right',
        },
        {
          href: 'https://github.com/cornerstonejs/cornerstone3D-beta/',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub Repository',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          items: [
            {
              html: `
               <div id="logo-wrapper-footer">
                <img src='/img/cornerstone-dark-footer.png' id="cs-logo-footer" alt="cornerstone" />
                <img src='/img/ohif-logo-dark.svg' id="ohif-logo-footer" alt="ohif" />
               </div>
              `,
            },
          ],
        },
        {
          title: 'Learn',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/getting-started/overview',
            },
            {
              label: 'Tutorials',
              to: '/docs/category/tutorials',
            },
            {
              label: 'How-to Guides',
              to: '/docs/category/how-to-guides',
            },
            {
              label: 'Concepts',
              to: '/docs/category/concepts',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Discussion board',
              href: 'https://community.ohif.org/',
            },
            {
              label: 'Help',
              to: '/docs/help',
            },
            {
              label: 'Contributing',
              to: '/docs/category/contributing',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Donate',
              href: 'https://ohif.org/donate/',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/cornerstonejs/cornerstone',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/OHIFviewer',
            },
          ],
        },
      ],
      copyright: `Cornerstone is open source software released under the MIT license.`,
    },
    prism: {
      theme: lightCodeTheme,
      darkTheme: darkCodeTheme,
    },
  },
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          breadcrumbs: false,
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          editUrl:
            'https://github.com/cornerstonejs/cornerstone3D-beta/edit/main/packages/docs/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
        blog: false,
        googleAnalytics: {
          trackingID: 'UA-110573590-1',
        },
      },
    ],
  ],
  webpack: {
    jsLoader: (isServer) => ({
      // Using esbuild instead of babel-loader is recommended
      // by the docusaurus team to improve build times.
      // They use it themselves: https://github.com/facebook/docusaurus/blob/1efc6c609185c780c03d6205015b998e3ec24c3a/website/docusaurus.config.js#L96-L102
      // See https://github.com/facebook/docusaurus/issues/4765#issuecomment-841135926
      loader: require.resolve('esbuild-loader'),
      options: {
        loader: 'tsx',
        target: isServer ? 'node12' : 'es2017',
      },
    }),
  },
  plugins: [
    'plugin-image-zoom',
    require.resolve('./webpackConfigurationPlugin'),
    [
      'docusaurus-plugin-typedoc-api',
      {
        projectRoot: path.join(__dirname, '../../'),
        packages: [
          ...['core', 'tools', 'streaming-image-volume-loader'].map(
            (pkg) => `packages/${pkg}`
          ),
        ],
        minimal: false,
        readmes: true,
        debug: true,
        tsconfigName: 'tsconfig.json',
      },
    ],
  ],
};
