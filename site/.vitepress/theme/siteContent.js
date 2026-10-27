export const siteContent = {
  zh: {
    meta: {
      title: 'RxnCanvas · 计算化学反应路径工作台',
      description: '导入计算输出，组装反应路径，核对结构与能量，并导出可继续编辑的图表。'
    },
    header: {
      homeLabel: 'RxnCanvas 首页',
      navigationLabel: '主导航',
      workflow: '工作流',
      capabilities: '能力',
      formats: '格式',
      privacy: '本地优先',
      docs: '文档',
      openMenu: '打开菜单',
      closeMenu: '关闭菜单',
      mobileNavigationLabel: '移动导航',
      switchToEnglish: '切换到英文',
      switchToChinese: '切换到中文',
      switchToDark: '切换到深色模式',
      switchToLight: '切换到浅色模式'
    },
    hero: {
      titleLead: '让计算结果，',
      titleTail: '连成反应路径。',
      lede: '导入 Gaussian、ORCA 等计算输出，在同一个画布里组装路径、核对结构与能量，再导出可继续编辑的图表。',
      download: '下载测试版',
      demo: '观看产品演示',
      note: '本地运行 · 无需账号 · 计算数据不上传',
      imageAlt: 'RxnCanvas 工作台，展示反应物、过渡态、产物节点及反应路径',
      caption: '从导入文件到可编辑的反应路径画布',
      next: '继续查看工作流'
    },
    workflow: {
      kicker: '从输出到可汇报的结果',
      title: '一条路径，四个明确步骤。',
      description: 'RxnCanvas 不运行量化计算。它把已有结果整理成可检查、可编辑、可分享的项目。',
      steps: [
        {
          number: '01',
          title: '导入',
          body: '读取计算输出，先核对候选结构与解析提示。'
        },
        {
          number: '02',
          title: '组装',
          body: '拖入节点、连接反应步骤，把路径摆清楚。'
        },
        {
          number: '03',
          title: '核对',
          body: '查看结构、振动模式与相对能量，再确认结论。'
        },
        {
          number: '04',
          title: '导出',
          body: '输出 PNG、CDXML 与 XLSX，继续制图或汇报。'
        }
      ]
    },
    product: {
      canvas: {
        kicker: '反应路径画布',
        titleLead: '把零散文件，',
        titleTail: '组织成一张图。',
        body: '从文件列表拖入反应物、中间体、过渡态与产物，连接反应步骤。路径、能量和结构都在同一个项目里。',
        points: [
          '节点拖动、复制粘贴与撤销重做',
          '同一项目使用多个画布整理不同路径',
          '用文字、图片和能垒连接补充说明'
        ],
        imageAlt: 'RxnCanvas 画布中的反应物、过渡态和产物节点'
      },
      structure: {
        kicker: '结构检查',
        titleLead: '二维与三维，',
        titleTail: '一起核对。',
        body: '检查分子连接与立体结构，旋转查看三维坐标，量测键长、键角和二面角。过渡态可播放默认振动模式。',
        boundary: '结构来自原始计算文件。用于研究结论前，请对照原始输出确认目标虚频、方法与单位。',
        imageAlt: 'RxnCanvas 结构预览窗口，同时显示二维化学结构与可旋转的三维分子模型'
      },
      energy: {
        kicker: '能量比较',
        titleLead: '同一基准下，',
        titleTail: '看清差异。',
        body: '设置能量零点与物种系数，在 ΔEgas 与 ΔGsol 之间切换。通过绝对、相对能量表检查每个数值的来源。'
      },
      export: {
        kicker: '导出结果',
        title: '图能改，数据也能查。',
        body: 'PNG 用于汇报，CDXML 可在 ChemDraw 中继续编辑，XLSX 保留绝对/相对能量、导入文件与元数据。'
      },
      privacy: {
        kicker: '本地优先',
        title: '项目留在你的电脑上。',
        body: '无需账号，不提供云同步，不收集遥测，也不自动上传计算数据。',
        points: [
          '自动保存到项目文件夹',
          '原始计算文件保存在 sources/',
          '可打包为 .rxncanvas.zip'
        ],
        download: '下载测试版'
      }
    },
    energy: {
      label: '能量显示方式',
      relative: '相对',
      absolute: '绝对',
      tableTitle: '相对',
      tableTitleAbsolute: '绝对',
      structure: '结构',
      note: '示例数据 · kcal/mol'
    },
    exportPreview: {
      tabsLabel: '导出格式预览',
      cdxmlTitle: '在 ChemDraw 中继续编辑',
      cdxmlAlt: 'CDXML 导出预览，显示反应能量路径和化学结构',
      xlsxTitle: '保留能量表与来源信息',
      xlsxAlt: 'XLSX 导出预览，包含相对和绝对能量表'
    },
    demo: {
      kicker: '产品演示',
      title: '从计算结果，到一张路径图。',
      description: '58 秒看完导入、组装、结构检查、能量比较和导出。',
      play: '播放 RxnCanvas 产品演示',
      titleCard: 'RxnCanvas 产品预览',
      meta: '58 秒 · 音乐演示',
      close: '关闭视频',
      pause: '暂停',
      playVideo: '播放',
      progress: '视频进度',
      unmute: '取消静音',
      mute: '静音',
      fullscreen: '全屏播放'
    },
    formats: {
      kicker: '计算文件',
      title: '从熟悉的输出开始。',
      description: '不同程序版本与任务组合的覆盖程度不同。用于研究结论或报告前，请核对原始输出中的最终结构、方法、单位与校正项。',
      supported: '支持',
      experimental: '实验性',
      items: [
        {
          name: 'Gaussian',
          ext: '.log / .out',
          body: '结构、能量、热化学校正及部分频率与振动信息'
        },
        {
          name: 'ORCA',
          ext: '.out',
          body: '结构、能量及部分溶剂与计算信息'
        },
        {
          name: 'XYZ / extxyz',
          ext: '.xyz',
          body: '单帧、多帧坐标及可识别的能量信息'
        }
      ]
    },
    download: {
      kicker: 'RxnCanvas Beta',
      titleLead: '把下一次整理，',
      titleTail: '画成一条路径。',
      releases: '前往 Releases',
      docs: '查看使用文档',
      macos: 'Apple Silicon · arm64',
      windows: 'x64 · 安装版 / 便携版'
    },
    footer: {
      description: '计算化学反应路径工作台 · Beta',
      navigationLabel: '页脚导航',
      privacy: '隐私',
      license: '许可'
    }
  },
  en: {
    meta: {
      title: 'RxnCanvas · Reaction pathway workbench for computational chemistry',
      description: 'Import calculation outputs, assemble reaction pathways, verify structures and energies, and export editable figures.'
    },
    header: {
      homeLabel: 'RxnCanvas home',
      navigationLabel: 'Main navigation',
      workflow: 'Workflow',
      capabilities: 'Capabilities',
      formats: 'Formats',
      privacy: 'Local-first',
      docs: 'Docs',
      openMenu: 'Open menu',
      closeMenu: 'Close menu',
      mobileNavigationLabel: 'Mobile navigation',
      switchToEnglish: 'Switch to English',
      switchToChinese: 'Switch to Chinese',
      switchToDark: 'Switch to dark mode',
      switchToLight: 'Switch to light mode'
    },
    hero: {
      titleLead: 'Turn calculation results',
      titleTail: 'into reaction pathways.',
      lede: 'Import outputs from Gaussian, ORCA, and other programs. Assemble pathways, verify structures and energies, then export figures you can keep editing.',
      download: 'Download beta',
      demo: 'Watch product demo',
      note: 'Runs locally · No account · Calculation data stays on your computer',
      imageAlt: 'RxnCanvas workbench showing reactant, transition state, and product nodes along a reaction pathway',
      caption: 'From imported files to an editable reaction pathway canvas',
      next: 'Continue to workflow'
    },
    workflow: {
      kicker: 'From output to report-ready results',
      title: 'One pathway. Four clear steps.',
      description: 'RxnCanvas does not run quantum chemistry calculations. It turns existing results into a project you can inspect, edit, and share.',
      steps: [
        {
          number: '01',
          title: 'Import',
          body: 'Read calculation outputs and verify candidate structures and parser warnings.'
        },
        {
          number: '02',
          title: 'Assemble',
          body: 'Drag in nodes and connect reaction steps to make the pathway clear.'
        },
        {
          number: '03',
          title: 'Verify',
          body: 'Inspect structures, vibrational modes, and relative energies before drawing conclusions.'
        },
        {
          number: '04',
          title: 'Export',
          body: 'Export PNG, CDXML, and XLSX files for further editing or reporting.'
        }
      ]
    },
    product: {
      canvas: {
        kicker: 'Reaction pathway canvas',
        titleLead: 'Turn scattered files',
        titleTail: 'into one map.',
        body: 'Drag reactants, intermediates, transition states, and products from the file list, then connect the reaction steps. Pathways, energies, and structures stay in one project.',
        points: [
          'Drag nodes, copy and paste, undo and redo',
          'Use multiple canvases to organize pathways in one project',
          'Add context with text, images, and barrier connectors'
        ],
        imageAlt: 'Reactant, transition state, and product nodes on an RxnCanvas pathway'
      },
      structure: {
        kicker: 'Structure inspection',
        titleLead: 'Check 2D and 3D',
        titleTail: 'side by side.',
        body: 'Inspect molecular connectivity and stereochemistry, rotate 3D coordinates, and measure bond lengths, angles, and dihedrals. Play the default vibration for transition states.',
        boundary: 'Structures come from the original calculation files. Before using them in research conclusions, confirm the target imaginary frequency, method, and units against the raw output.',
        imageAlt: 'RxnCanvas structure preview showing a 2D chemical structure beside a rotatable 3D molecular model'
      },
      energy: {
        kicker: 'Energy comparison',
        titleLead: 'Compare values',
        titleTail: 'on the same baseline.',
        body: 'Set the energy zero and species coefficients, then switch between ΔEgas and ΔGsol. Use the absolute and relative energy tables to check where every value comes from.'
      },
      export: {
        kicker: 'Export results',
        title: 'Editable figures. Traceable data.',
        body: 'Use PNG for presentations, keep editing in ChemDraw with CDXML, and preserve absolute and relative energies, imported files, and metadata in XLSX.'
      },
      privacy: {
        kicker: 'Local-first',
        title: 'Your project stays on your computer.',
        body: 'No account, no cloud sync, no telemetry, and no automatic upload of calculation data.',
        points: [
          'Automatically saves to the project folder',
          'Original calculation files stay in sources/',
          'Can be packaged as a .rxncanvas.zip file'
        ],
        download: 'Download beta'
      }
    },
    energy: {
      label: 'Energy display mode',
      relative: 'Relative',
      absolute: 'Absolute',
      tableTitle: 'Relative',
      tableTitleAbsolute: 'Absolute',
      structure: 'Structure',
      note: 'Sample data · kcal/mol'
    },
    exportPreview: {
      tabsLabel: 'Export format preview',
      cdxmlTitle: 'Continue editing in ChemDraw',
      cdxmlAlt: 'CDXML export preview showing a reaction energy pathway and chemical structures',
      xlsxTitle: 'Keep energy tables and source information',
      xlsxAlt: 'XLSX export preview containing relative and absolute energy tables'
    },
    demo: {
      kicker: 'Product demo',
      title: 'From calculation output to a pathway figure.',
      description: 'See import, assembly, structure inspection, energy comparison, and export in 58 seconds.',
      play: 'Play the RxnCanvas product demo',
      titleCard: 'RxnCanvas product preview',
      meta: '58 sec · Music',
      close: 'Close video',
      pause: 'Pause',
      playVideo: 'Play',
      progress: 'Video progress',
      unmute: 'Unmute',
      mute: 'Mute',
      fullscreen: 'Play fullscreen'
    },
    formats: {
      kicker: 'Calculation files',
      title: 'Start with outputs you already use.',
      description: 'Coverage varies by program version and calculation type. Before using a result in research conclusions or reports, verify the final structure, method, units, and corrections against the raw output.',
      supported: 'Supported',
      experimental: 'Experimental',
      items: [
        {
          name: 'Gaussian',
          ext: '.log / .out',
          body: 'Structures, energies, thermochemical corrections, and selected frequency and vibration data'
        },
        {
          name: 'ORCA',
          ext: '.out',
          body: 'Structures, energies, and selected solvation and calculation details'
        },
        {
          name: 'XYZ / extxyz',
          ext: '.xyz',
          body: 'Single- and multi-frame coordinates with recognizable energy data'
        }
      ]
    },
    download: {
      kicker: 'RxnCanvas Beta',
      titleLead: 'Turn your next review',
      titleTail: 'into one pathway.',
      releases: 'View releases',
      docs: 'Read the user guide',
      macos: 'Apple Silicon · arm64',
      windows: 'x64 · Installer / Portable'
    },
    footer: {
      description: 'Reaction pathway workbench for computational chemistry · Beta',
      navigationLabel: 'Footer navigation',
      privacy: 'Privacy',
      license: 'License'
    }
  }
}
