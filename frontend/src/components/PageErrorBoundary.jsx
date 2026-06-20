import { Component } from 'react'
import Icon from './Icon'

export default class PageErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('Page render failed', error, info) }
  render() {
    if (this.state.error) return <div className="page-error"><Icon name="alert"/><h2>This screen could not render</h2><p>{this.state.error.message}</p><button onClick={()=>window.location.reload()}>Reload screen</button></div>
    return this.props.children
  }
}
