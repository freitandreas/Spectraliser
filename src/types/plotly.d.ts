declare module 'plotly.js-dist-min' {
  const Plotly: {
    react: (...args: unknown[]) => Promise<unknown>
  }

  export default Plotly
}
